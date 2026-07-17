import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { cursorPosition, getCurrentWindow, monitorFromPoint } from '@tauri-apps/api/window'
import { getTranslationSettingsLoaded } from './config'

const SCREENSHOT_SELECTION_WINDOW_PREFIX = 'screenshot-selection-'
const TRANSLATION_OVERLAY_WINDOW_PREFIX = 'translation-overlay-'

export interface ScreenRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface CapturedScreenshot {
  imagePath: string
}

export interface SelectionWindowParams {
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

export interface TranslationOverlayPayload {
  x: number
  y: number
  width: number
  height: number
  text: string
}

export function screenshotImageSrc(imagePath: string) {
  return convertFileSrc(imagePath)
}

export async function captureScreenRegion(region: ScreenRegion) {
  return invoke<CapturedScreenshot>('capture_screen_region', { region })
}

export async function recognizeScreenshotText(
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

export async function deleteScreenshotFile(imagePath: string) {
  return invoke<void>('delete_screenshot_file', { imagePath })
}

export async function destroyScreenshotWindows() {
  const windows = await WebviewWindow.getAll()
  const screenshotWindows = windows.filter(window =>
    window.label.startsWith(SCREENSHOT_SELECTION_WINDOW_PREFIX)
    || window.label.startsWith(TRANSLATION_OVERLAY_WINDOW_PREFIX))

  await Promise.all(screenshotWindows.map(window => window.destroy().catch(() => undefined)))
}

export async function translateScreenshotText(text: string) {
  const { aiConfig, provider } = await getTranslationSettingsLoaded()

  if (provider === 'ai') {
    return invoke<string>('translate_text_to_chinese', {
      baseUrl: aiConfig.baseURL,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model,
      text,
    })
  }

  return invoke<string>(
    provider === 'google' ? 'translate_with_google_to_chinese' : 'translate_with_microsoft_to_chinese',
    { text },
  )
}

export async function openScreenshotSelectionWindow() {
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
    await appWindow.show().catch(() => undefined)
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
    await appWindow.show().catch(() => undefined)
    throw err
  }
}

export async function openTranslationOverlay(payload: TranslationOverlayPayload) {
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

export function readSelectionWindowParams(search = window.location.search): SelectionWindowParams {
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

export function readTranslationOverlayPayload(search = window.location.search) {
  const key = translationOverlayStorageKey(search)
  if (!key) {
    return null
  }

  const raw = localStorage.getItem(key)
  if (!raw) {
    return null
  }

  return JSON.parse(raw) as TranslationOverlayPayload
}

export function clearTranslationOverlayPayload(search = window.location.search) {
  const key = translationOverlayStorageKey(search)
  if (key) {
    localStorage.removeItem(key)
  }
}

export function physicalSelection(selection: ScreenRegion, scaleFactor: number): ScreenRegion {
  return {
    x: Math.round(selection.x * scaleFactor),
    y: Math.round(selection.y * scaleFactor),
    width: Math.round(selection.width * scaleFactor),
    height: Math.round(selection.height * scaleFactor),
  }
}

export function logicalOverlayRect(selection: ScreenRegion, params: SelectionWindowParams) {
  return {
    x: params.logicalX + selection.x,
    y: params.logicalY + selection.y,
    width: selection.width,
    height: selection.height,
  }
}
