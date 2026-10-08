import type { TranslationTarget } from './config'
import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core'
import { emitTo } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { cursorPosition, getCurrentWindow, monitorFromPoint } from '@tauri-apps/api/window'
import { recordTranslation } from './history'
import { translate } from './translate'

const SCREENSHOT_SELECTION_WINDOW_PREFIX = 'screenshot-selection-'
const TRANSLATION_OVERLAY_WINDOW_PREFIX = 'translation-overlay-'

export interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

interface CapturedScreenshot {
  imagePath: string
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
}

interface TranslationOverlayPayload {
  x: number
  y: number
  width: number
  height: number
  text: string
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

type SubmissionPhase = 'idle' | 'working' | 'opening' | 'opened' | 'cancelled'

let submissionPhase: SubmissionPhase = 'idle'
let selectionWindowDestroyed = false
let cachedRecognition: { key: string, text: string } | null = null
let startingScreenshot = false

function submissionWasCancelled() {
  return submissionPhase === 'cancelled'
}

async function destroyScreenshotWindows() {
  const windows = await WebviewWindow.getAll()
  const screenshotWindows = windows.filter(window =>
    window.label.startsWith(SCREENSHOT_SELECTION_WINDOW_PREFIX)
    || window.label.startsWith(TRANSLATION_OVERLAY_WINDOW_PREFIX))

  await Promise.all(screenshotWindows.map(window => window.destroy().catch(() => undefined)))
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
  }

  const label = `${SCREENSHOT_SELECTION_WINDOW_PREFIX}${Date.now()}`
  const url = `/?window=screenshot-selection&${new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString()}`

  const win = new WebviewWindow(label, {
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

  try {
    await new Promise<void>((resolve, reject) => {
      win.once('tauri://created', () => resolve())
      win.once('tauri://error', event => reject(new Error(String(event.payload))))
    })
  }
  catch (err) {
    await deleteScreenshotFile(capture.imagePath).catch(() => undefined)
    await restoreAppWindow()
    throw err
  }
}

async function openTranslationOverlay(payload: TranslationOverlayPayload) {
  const label = `${TRANSLATION_OVERLAY_WINDOW_PREFIX}${Date.now()}`
  localStorage.setItem(`translation-overlay:${label}`, JSON.stringify({
    ...payload,
  }))

  const win = new WebviewWindow(label, {
    url: `/?window=translation-overlay&label=${encodeURIComponent(label)}`,
    x: payload.x,
    y: payload.y,
    width: payload.width,
    height: payload.height,
    decorations: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: true,
  })

  await new Promise<void>((resolve, reject) => {
    win.once('tauri://created', () => resolve())
    win.once('tauri://error', event => reject(new Error(String(event.payload))))
  })
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
  if (submissionPhase === 'opening' || submissionPhase === 'opened' || submissionPhase === 'cancelled') {
    return
  }
  submissionPhase = 'cancelled'
  await discardSelection()
  await destroySelectionWindow()
}

export async function translateSelection(selection: ScreenRegion, target?: TranslationTarget) {
  if (submissionPhase !== 'idle') {
    return
  }

  submissionPhase = 'working'
  const params = readSelectionWindowParams()
  try {
    const key = JSON.stringify([params.imagePath, selection.x, selection.y, selection.width, selection.height])
    if (cachedRecognition?.key !== key) {
      cachedRecognition = null
      const text = await recognizeScreenshotText(
        params.imagePath,
        physicalSelection(selection, params.scaleFactor),
        params.screenWidth,
        params.screenHeight,
      )
      if (submissionWasCancelled())
        return
      cachedRecognition = { key, text }
    }
    const recognizedText = cachedRecognition.text
    if (submissionWasCancelled()) {
      return
    }
    const translated = await translate(recognizedText, 'screenshot', undefined, target)
    if (submissionWasCancelled()) {
      return
    }
    submissionPhase = 'opening'
    await openTranslationOverlay({
      ...logicalOverlayRect(selection, params),
      text: translated?.text ?? '',
    })
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
    submissionPhase = 'idle'
    throw err
  }
}

export function takeOverlayText() {
  const key = translationOverlayStorageKey()
  if (!key) {
    return null
  }

  const raw = localStorage.getItem(key)
  localStorage.removeItem(key)
  if (!raw) {
    return null
  }

  return (JSON.parse(raw) as TranslationOverlayPayload).text
}
