import type { TranslationTarget } from './config'
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { emitTo, listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { cursorPosition, getCurrentWindow, monitorFromPoint } from '@tauri-apps/api/window'
import { recordTranslation } from './history'
import { translate } from './translate'

const SCREENSHOT_SELECTION_WINDOW_PREFIX = 'screenshot-selection-'
const TRANSLATION_OVERLAY_WINDOW_PREFIX = 'translation-overlay-'
const OVERLAY_READY_EVENT = 'translation-overlay-ready'

export interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

interface CapturedScreenshot {
  imagePath: string
  workArea: ScreenRegion
}

interface SelectionWindowParams {
  imagePath: string
  screenX: number
  screenY: number
  screenWidth: number
  screenHeight: number
  scaleFactor: number
  logicalX: number
  logicalY: number
  logicalWidth: number
  logicalHeight: number
  workAreaX: number
  workAreaY: number
  workAreaWidth: number
  workAreaHeight: number
}

interface TranslationOverlayPayload extends ScreenRegion {
  text: string
  workArea: ScreenRegion
  selectionWindowLabel: string
  original: {
    imagePath: string
    region: ScreenRegion
    imageWidth: number
    imageHeight: number
  }
}

interface OverlayReady {
  label: string
  error?: string
}

function screenshotImageSrc(imagePath: string) {
  return convertFileSrc(imagePath)
}

async function captureScreenRegion(region: ScreenRegion) {
  return invoke<CapturedScreenshot>('capture_screen_region', { region })
}

async function recognizeScreenshotText(
  imagePath: string,
  imageRegion: ScreenRegion,
  imageWidth: number,
  imageHeight: number,
) {
  return invoke<string>('recognize_screenshot_text', {
    imagePath,
    imageRegion,
    imageWidth,
    imageHeight,
  })
}

async function deleteScreenshotFile(imagePath: string) {
  return invoke<void>('delete_screenshot_file', { imagePath })
}

async function transferScreenshotFile(imagePath: string, targetWindowLabel: string) {
  return invoke<boolean>('transfer_screenshot_file', { imagePath, targetWindowLabel })
}

export type ScreenshotTranslationStage = 'recognizing' | 'translating' | 'opening'

type SubmissionPhase = 'idle' | 'working' | 'opening' | 'opened' | 'cancelled'

let submissionPhase: SubmissionPhase = 'idle'
let submissionController: AbortController | null = null
let pendingOverlay: Promise<void> | null = null
let selectionWindowDestroyed = false
let cachedRecognition: { key: string, text: string } | null = null
let startingScreenshot = false
let overlayPayloadCache: { key: string, payload: TranslationOverlayPayload } | null = null

function submissionWasCancelled() {
  return submissionPhase === 'cancelled'
}

// Stop waiting in JavaScript; the native OCR / provider request may still finish.
function awaitSubmission<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel))
    if (signal.aborted)
      cancel()
  })
}

async function destroyScreenshotWindows() {
  const windows = await WebviewWindow.getAll()
  const screenshotWindows = windows.filter(window =>
    window.label.startsWith(SCREENSHOT_SELECTION_WINDOW_PREFIX)
    || window.label.startsWith(TRANSLATION_OVERLAY_WINDOW_PREFIX))

  await Promise.all(screenshotWindows.map(async (window) => {
    localStorage.removeItem(`translation-overlay:${window.label}`)
    await window.destroy().catch(() => undefined)
  }))
}

async function destroySelectionWindow() {
  if (selectionWindowDestroyed) {
    return
  }
  selectionWindowDestroyed = true
  await getCurrentWindow().destroy()
}

export async function revealSelectionWindow() {
  const selectionWindow = getCurrentWindow()
  await selectionWindow.show()
  const appWindow = await WebviewWindow.getByLabel('main')
  await appWindow?.show()
  await selectionWindow.setFocus()
}

export async function bindAppWindowClose(): Promise<() => void> {
  if (!isTauri()) {
    return () => {}
  }

  const appWindow = getCurrentWindow()
  try {
    return await appWindow.onCloseRequested(async (event) => {
      event.preventDefault()
      try {
        await destroyScreenshotWindows()
      }
      finally {
        await appWindow.destroy()
      }
    })
  }
  catch (err) {
    console.error('无法注册截图窗口清理监听', err)
    return () => {}
  }
}

export async function startScreenshotTranslation() {
  if (startingScreenshot)
    return
  if (!isTauri())
    throw new Error('截图翻译仅在桌面应用中可用')
  startingScreenshot = true
  try {
    const existing = (await WebviewWindow.getAll()).find(win => win.label.startsWith(SCREENSHOT_SELECTION_WINDOW_PREFIX))
    if (existing) {
      await existing.setFocus()
      return
    }
    await captureAndOpenSelection()
  }
  finally {
    startingScreenshot = false
  }
}

async function restoreAppWindow() {
  const appWindow = getCurrentWindow()
  await appWindow.unminimize().catch(() => undefined)
  await appWindow.show().catch(() => undefined)
  await appWindow.setFocus().catch(() => undefined)
}

async function captureAndOpenSelection() {
  const appWindow = getCurrentWindow()
  const position = await cursorPosition()
  const monitor = await monitorFromPoint(position.x, position.y)
  if (!monitor) {
    throw new Error('无法识别当前显示器')
  }

  const logicalPosition = monitor.position.toLogical(monitor.scaleFactor)
  const logicalSize = monitor.size.toLogical(monitor.scaleFactor)
  await appWindow.hide()

  let capture: CapturedScreenshot
  try {
    await new Promise(resolve => setTimeout(resolve, 120))
    capture = await captureScreenRegion({
      x: monitor.position.x,
      y: monitor.position.y,
      width: monitor.size.width,
      height: monitor.size.height,
    })
  }
  catch (err) {
    await restoreAppWindow()
    throw err
  }

  const params: SelectionWindowParams = {
    imagePath: capture.imagePath,
    screenX: monitor.position.x,
    screenY: monitor.position.y,
    screenWidth: monitor.size.width,
    screenHeight: monitor.size.height,
    scaleFactor: monitor.scaleFactor,
    logicalX: logicalPosition.x,
    logicalY: logicalPosition.y,
    logicalWidth: logicalSize.width,
    logicalHeight: logicalSize.height,
    workAreaX: capture.workArea.x,
    workAreaY: capture.workArea.y,
    workAreaWidth: capture.workArea.width,
    workAreaHeight: capture.workArea.height,
  }

  const label = `${SCREENSHOT_SELECTION_WINDOW_PREFIX}${Date.now()}`
  const url = `/?window=screenshot-selection&${new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString()}`

  let win: WebviewWindow | undefined
  try {
    win = new WebviewWindow(label, {
      url,
      x: logicalPosition.x,
      y: logicalPosition.y,
      width: logicalSize.width,
      height: logicalSize.height,
      decorations: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
      focus: true,
    })
    const selectionWindow = win
    await new Promise<void>((resolve, reject) => {
      selectionWindow.once('tauri://created', () => resolve())
      selectionWindow.once('tauri://error', event => reject(new Error(String(event.payload))))
    })
    if (!await transferScreenshotFile(capture.imagePath, label)) {
      await deleteScreenshotFile(capture.imagePath)
      await restoreAppWindow()
    }
  }
  catch (err) {
    await win?.destroy().catch(() => undefined)
    await deleteScreenshotFile(capture.imagePath).catch(() => undefined)
    await restoreAppWindow()
    throw err
  }
}

async function openTranslationOverlay(payload: TranslationOverlayPayload, signal: AbortSignal) {
  const label = `${TRANSLATION_OVERLAY_WINDOW_PREFIX}${Date.now()}`
  const key = `translation-overlay:${label}`
  const stops: (() => void)[] = []
  let cleanedUp = false
  const addStop = (stop: () => void) => {
    if (cleanedUp)
      stop()
    else
      stops.push(stop)
  }
  let win: WebviewWindow | undefined
  let shown = false
  let created: Promise<void> | undefined
  let initializationTimeout: Promise<void> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  let resolveReady: () => void = () => {}
  let rejectReady: (error: Error) => void = () => {}
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })
  // The child may report an error before its native creation event arrives.
  void ready.catch(() => undefined)

  try {
    addStop(await listen<OverlayReady>(OVERLAY_READY_EVENT, ({ payload: result }) => {
      if (result.label !== label)
        return
      if (result.error)
        rejectReady(new Error(result.error))
      else
        resolveReady()
    }))
    signal.throwIfAborted()
    localStorage.setItem(key, JSON.stringify(payload))
    initializationTimeout = new Promise<void>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('截图阅读浮层初始化超时，请重试')), 10_000)
    })
    void initializationTimeout.catch(() => undefined)
    win = new WebviewWindow(label, {
      url: `/?window=translation-overlay&label=${encodeURIComponent(label)}`,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      decorations: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: false,
      focus: false,
    })
    const overlayWindow = win
    created = new Promise<void>((resolve, reject) => {
      void overlayWindow.once('tauri://created', () => resolve()).then(addStop, reject)
      void overlayWindow.once('tauri://error', event => reject(new Error(String(event.payload)))).then(addStop, reject)
    })
    await awaitSubmission(Promise.race([Promise.all([created, ready]), initializationTimeout]), signal)
    signal.throwIfAborted()
    clearTimeout(timeout)
    await win.show()
    signal.throwIfAborted()
    shown = true
    submissionPhase = 'opened'
    await win.setFocus()
    if (!await transferScreenshotFile(payload.original.imagePath, label)) {
      await deleteScreenshotFile(payload.original.imagePath)
    }
  }
  catch (err) {
    // Keep the hidden parent alive until a queued native creation can be
    // destroyed. Destroying before tauri://created can miss the new window.
    if (signal.aborted && created && initializationTimeout)
      await Promise.race([created, initializationTimeout]).catch(() => undefined)
    if (shown && !await WebviewWindow.getByLabel(label)) {
      await deleteScreenshotFile(payload.original.imagePath)
      return
    }
    await win?.destroy().catch(() => undefined)
    if (!submissionWasCancelled())
      submissionPhase = 'opening'
    throw err
  }
  finally {
    clearTimeout(timeout)
    cleanedUp = true
    stops.forEach(stop => stop())
    localStorage.removeItem(key)
  }
}

function readSelectionWindowParams(search = window.location.search): SelectionWindowParams {
  const params = new URLSearchParams(search)
  return {
    imagePath: params.get('imagePath') ?? '',
    screenX: Number(params.get('screenX')),
    screenY: Number(params.get('screenY')),
    screenWidth: Number(params.get('screenWidth')),
    screenHeight: Number(params.get('screenHeight')),
    scaleFactor: Number(params.get('scaleFactor')),
    logicalX: Number(params.get('logicalX')),
    logicalY: Number(params.get('logicalY')),
    logicalWidth: Number(params.get('logicalWidth')),
    logicalHeight: Number(params.get('logicalHeight')),
    workAreaX: Number(params.get('workAreaX')),
    workAreaY: Number(params.get('workAreaY')),
    workAreaWidth: Number(params.get('workAreaWidth')),
    workAreaHeight: Number(params.get('workAreaHeight')),
  }
}

function translationOverlayStorageKey(search = window.location.search) {
  const label = new URLSearchParams(search).get('label')
  if (!label) {
    return null
  }

  return `translation-overlay:${label}`
}

function physicalSelection(selection: ScreenRegion, scaleFactor: number): ScreenRegion {
  return {
    x: Math.round(selection.x * scaleFactor),
    y: Math.round(selection.y * scaleFactor),
    width: Math.round(selection.width * scaleFactor),
    height: Math.round(selection.height * scaleFactor),
  }
}

function logicalOverlayRect(selection: ScreenRegion, params: SelectionWindowParams) {
  return {
    x: params.logicalX + selection.x,
    y: params.logicalY + selection.y,
    width: selection.width,
    height: selection.height,
  }
}

export function selectionFrame() {
  const params = readSelectionWindowParams()
  return {
    imageSrc: params.imagePath ? screenshotImageSrc(params.imagePath) : '',
    logicalWidth: params.logicalWidth,
    logicalHeight: params.logicalHeight,
  }
}

export async function discardSelection() {
  cachedRecognition = null
  const { imagePath } = readSelectionWindowParams()
  if (!imagePath) {
    return
  }
  await deleteScreenshotFile(imagePath).catch(() => undefined)
}

export async function cancelSelection() {
  if (submissionPhase === 'opened' || submissionPhase === 'cancelled') {
    return
  }
  submissionPhase = 'cancelled'
  submissionController?.abort()
  const opening = pendingOverlay
  if (opening) {
    await getCurrentWindow().hide().catch(() => undefined)
    await opening.catch(() => undefined)
  }
  // Native window destruction also releases owned screenshots; do not let file
  // cleanup hold the working UI open while a native operation is still running.
  void discardSelection()
  await destroySelectionWindow()
}

export async function translateSelection(
  selection: ScreenRegion,
  target?: TranslationTarget,
  onProgress?: (stage: ScreenshotTranslationStage) => void,
) {
  if (submissionPhase !== 'idle') {
    return
  }

  submissionPhase = 'working'
  const controller = new AbortController()
  submissionController = controller
  const { signal } = controller
  const params = readSelectionWindowParams()
  try {
    const key = JSON.stringify([params.imagePath, selection.x, selection.y, selection.width, selection.height])
    if (cachedRecognition?.key !== key) {
      cachedRecognition = null
      onProgress?.('recognizing')
      signal.throwIfAborted()
      const text = await awaitSubmission(recognizeScreenshotText(
        params.imagePath,
        physicalSelection(selection, params.scaleFactor),
        params.screenWidth,
        params.screenHeight,
      ), signal)
      if (submissionWasCancelled())
        return
      cachedRecognition = { key, text }
    }
    const recognizedText = cachedRecognition.text
    if (submissionWasCancelled()) {
      return
    }
    onProgress?.('translating')
    signal.throwIfAborted()
    const translated = await awaitSubmission(translate(recognizedText, 'screenshot', signal, target), signal)
    if (submissionWasCancelled()) {
      return
    }
    submissionPhase = 'opening'
    onProgress?.('opening')
    signal.throwIfAborted()
    pendingOverlay = openTranslationOverlay({
      ...logicalOverlayRect(selection, params),
      text: translated?.text ?? '',
      selectionWindowLabel: getCurrentWindow().label,
      workArea: {
        x: params.workAreaX,
        y: params.workAreaY,
        width: params.workAreaWidth,
        height: params.workAreaHeight,
      },
      original: {
        imagePath: params.imagePath,
        region: selection,
        imageWidth: params.logicalWidth,
        imageHeight: params.logicalHeight,
      },
    }, signal)
    await pendingOverlay
    submissionPhase = 'opened'
    if (translated) {
      try {
        await recordTranslation(recognizedText, 'screenshot', translated)
      }
      catch {
        await emitTo('main', 'history-save-failed', '截图译文已完成，但未能保存到本地历史。').catch(() => undefined)
      }
    }
    await discardSelection()
    await destroySelectionWindow()
  }
  catch (err) {
    if (submissionWasCancelled()) {
      return
    }
    if (submissionPhase !== 'opened')
      submissionPhase = 'idle'
    throw err
  }
  finally {
    submissionController = null
    pendingOverlay = null
  }
}

function readOverlayPayload() {
  const key = translationOverlayStorageKey()
  if (!key) {
    return null
  }

  if (overlayPayloadCache?.key === key)
    return overlayPayloadCache.payload

  const raw = localStorage.getItem(key)
  localStorage.removeItem(key)
  if (!raw) {
    return null
  }

  const payload = JSON.parse(raw) as TranslationOverlayPayload
  overlayPayloadCache = { key, payload }
  return payload
}

export function readTranslationOverlay() {
  const payload = readOverlayPayload()
  if (!payload)
    return null

  return {
    text: payload.text,
    original: {
      src: screenshotImageSrc(payload.original.imagePath),
      region: payload.original.region,
      imageWidth: payload.original.imageWidth,
      imageHeight: payload.original.imageHeight,
    },
  }
}

export async function prepareTranslationOverlay(measureHeight: (width: number) => number) {
  const payload = readOverlayPayload()
  if (!payload)
    throw new Error('截图阅读浮层数据不存在')

  const margin = 12
  const { workArea } = payload
  const availableWidth = workArea.width - margin * 2
  const availableHeight = workArea.height - margin * 2
  let width = Math.min(payload.width, availableWidth)
  let height = payload.height
  if (width < 240 || height > availableHeight || measureHeight(width) > height) {
    width = Math.min(Math.max(payload.width, 420), 640, availableWidth)
    height = Math.min(Math.max(Math.ceil(measureHeight(width)), 120), 560, availableHeight)
  }
  const x = Math.max(workArea.x + margin, Math.min(payload.x, workArea.x + workArea.width - margin - width))
  const y = Math.max(workArea.y + margin, Math.min(payload.y, workArea.y + workArea.height - margin - height))
  const currentWindow = getCurrentWindow()
  await currentWindow.setSize(new LogicalSize(width, height))
  await currentWindow.setPosition(new LogicalPosition(x, y))
  await emitTo(payload.selectionWindowLabel, OVERLAY_READY_EVENT, { label: currentWindow.label })
}

export async function reportTranslationOverlayError(message: string) {
  const payload = readOverlayPayload()
  if (payload) {
    await emitTo(payload.selectionWindowLabel, OVERLAY_READY_EVENT, {
      label: getCurrentWindow().label,
      error: message,
    })
  }
}
