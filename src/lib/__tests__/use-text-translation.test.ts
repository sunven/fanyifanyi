import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTranslationProvider } from '../config'
import { useTextTranslation } from '../use-text-translation'

const { invoke, emitTo } = vi.hoisted(() => ({ invoke: vi.fn(), emitTo: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', () => ({ emitTo }))
vi.mock('../logger', () => ({ logger: { error: vi.fn() } }))

async function advanceTime(milliseconds = 1000) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

describe('text translation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invoke.mockReset()
    invoke.mockImplementation(command => Promise.resolve(command === 'is_clipboard_translation_current'
      ? true
      : command.startsWith('translate_with_') ? '你好' : undefined))
    emitTo.mockReset().mockResolvedValue(undefined)
  })

  afterEach(() => vi.useRealTimers())

  it('does not start translation or history for blank input, including retry', async () => {
    const { result } = renderHook(() => useTextTranslation('  \n'))
    await advanceTime()
    await act(async () => result.current.retry())

    expect(result.current).toMatchObject({ result: null, error: null, isLoading: false })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('waits for input to settle and rejects the old response during the new debounce', async () => {
    let finishOld: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finishOld = resolve
    }))
    const { result, rerender } = renderHook(({ text }) => useTextTranslation(text), {
      initialProps: { text: 'old' },
    })
    await advanceTime()
    expect(result.current.isLoading).toBe(true)

    rerender({ text: 'intermediate' })
    await advanceTime(500)
    rerender({ text: 'new' })
    await act(async () => finishOld('旧译文'))
    await advanceTime(999)

    expect(result.current).toMatchObject({ result: null, error: null, isLoading: false })
    expect(invoke).toHaveBeenCalledTimes(1)
    await advanceTime(1)

    expect(result.current.result).toEqual({ text: '你好', engine: { provider: 'google' } })
    expect(invoke).toHaveBeenCalledWith('translate_with_google', { text: 'new', targetLanguage: 'zh-CN' })
    const entries = invoke.mock.calls.filter(([command]) => command === 'history_record').map(([, args]) => args.entry)
    expect(entries).toEqual([expect.objectContaining({ sourceText: 'new', translatedText: '你好' })])
  })

  it('rejects a late response after stopping and lets unchanged text retry', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finish = resolve
    }))
    const { result } = renderHook(() => useTextTranslation('hello'))
    await advanceTime()
    act(() => result.current.stop())
    await act(async () => finish('已取消的译文'))

    expect(result.current).toMatchObject({ result: null, error: null, isLoading: false, historySaveFailed: false })
    expect(invoke).not.toHaveBeenCalledWith('history_record', expect.anything())
    await act(async () => result.current.retry())

    expect(result.current.result?.text).toBe('你好')
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
  })

  it('does not save a late shortcut translation after unmounting', async () => {
    let finish: (value: string) => void = () => {}
    invoke.mockReturnValueOnce(new Promise<string>((resolve) => {
      finish = resolve
    }))
    const { result, unmount } = renderHook(() => useTextTranslation('hello', { startDelay: 0, clipboardSessionId: 7 }))
    await advanceTime(0)
    expect(result.current.isLoading).toBe(true)
    unmount()
    await act(async () => finish('旧译文'))

    expect(invoke).not.toHaveBeenCalledWith('history_record', expect.anything())
    expect(emitTo).not.toHaveBeenCalled()
  })

  it('rejects a replaced native session and accepts its replacement without the desk delay', async () => {
    invoke.mockImplementation((command, args) => Promise.resolve(command === 'is_clipboard_translation_current'
      ? args.id === 8
      : command.startsWith('translate_with_') ? '你好' : undefined))
    const { result, rerender } = renderHook(({ sessionId }) => useTextTranslation('hello', { startDelay: 0, clipboardSessionId: sessionId }), {
      initialProps: { sessionId: 7 },
    })
    await advanceTime(0)

    expect(invoke).toHaveBeenCalledWith('is_clipboard_translation_current', { id: 7 })
    expect(result.current).toMatchObject({ result: null, error: null, isLoading: false })
    expect(invoke).not.toHaveBeenCalledWith('history_record', expect.anything())
    rerender({ sessionId: 8 })
    await advanceTime(0)

    expect(result.current.result?.text).toBe('你好')
    expect(invoke).toHaveBeenCalledWith('is_clipboard_translation_current', { id: 8 })
    expect(invoke).toHaveBeenCalledWith('history_record', expect.objectContaining({ clipboardSessionId: 8 }))
  })

  it('rejects native acceptance when stopped while the session check is pending', async () => {
    let accept: (current: boolean) => void = () => {}
    invoke.mockImplementation(command => command === 'is_clipboard_translation_current'
      ? new Promise<boolean>((resolve) => { accept = resolve })
      : Promise.resolve('你好'))
    const { result } = renderHook(() => useTextTranslation('hello', { startDelay: 0, clipboardSessionId: 7 }))
    await advanceTime(0)
    expect(invoke).toHaveBeenCalledWith('is_clipboard_translation_current', { id: 7 })
    act(() => result.current.stop())
    await act(async () => accept(true))

    expect(result.current).toMatchObject({ result: null, error: null, isLoading: false })
    expect(invoke).not.toHaveBeenCalledWith('history_record', expect.anything())
  })

  it('retries the failed engine even if the configured default changed', async () => {
    invoke.mockRejectedValueOnce('Google 不可用')
    const { result } = renderHook(() => useTextTranslation('hello'))
    await advanceTime()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Google 不可用')
    expect(result.current.isLoading).toBe(false)
    expect(invoke).not.toHaveBeenCalledWith('history_record', expect.anything())

    await setTranslationProvider('microsoft')
    await act(async () => result.current.retry())

    expect(result.current).toMatchObject({ result: { text: '你好', engine: { provider: 'google' } }, error: null })
    expect(invoke).not.toHaveBeenCalledWith('translate_with_microsoft', expect.anything())
    const entries = invoke.mock.calls.filter(([command]) => command === 'history_record').map(([, args]) => args.entry)
    expect(entries).toEqual([expect.objectContaining({ sourceText: 'hello', engine: { provider: 'google' } })])
  })

  it('keeps the fallback for retries and restores the default engine for new text', async () => {
    invoke.mockRejectedValueOnce('Google 不可用').mockRejectedValueOnce('Microsoft 不可用')
    const { result, rerender } = renderHook(({ text }) => useTextTranslation(text), {
      initialProps: { text: 'hello' },
    })
    await advanceTime()
    await act(async () => result.current.retry({ provider: 'microsoft' }))
    expect(result.current.error?.message).toBe('Microsoft 不可用')
    await act(async () => result.current.retry())

    expect(result.current.result?.engine).toEqual({ provider: 'microsoft' })
    rerender({ text: 'goodbye' })
    await advanceTime()

    expect(result.current.result?.engine).toEqual({ provider: 'google' })
    const requests = invoke.mock.calls.filter(([command]) => command.startsWith('translate_with_'))
    expect(requests.map(([command]) => command)).toEqual([
      'translate_with_google',
      'translate_with_microsoft',
      'translate_with_microsoft',
      'translate_with_google',
    ])
    const entries = invoke.mock.calls.filter(([command]) => command === 'history_record').map(([, args]) => args.entry)
    expect(entries).toEqual([
      expect.objectContaining({ sourceText: 'hello', engine: { provider: 'microsoft' } }),
      expect.objectContaining({ sourceText: 'goodbye', engine: { provider: 'google' } }),
    ])
  })

  it('exposes the translation while history is pending and finishes after the write', async () => {
    let save: () => void = () => {}
    invoke.mockImplementation(command => command === 'history_record'
      ? new Promise<void>((resolve) => { save = resolve })
      : Promise.resolve('你好'))
    const { result } = renderHook(() => useTextTranslation('hello'))
    await advanceTime()

    expect(result.current).toMatchObject({ result: { text: '你好' }, isLoading: true, historySaveFailed: false })
    expect(emitTo).not.toHaveBeenCalled()
    await act(async () => save())

    expect(result.current).toMatchObject({ result: { text: '你好' }, isLoading: false, error: null, historySaveFailed: false })
    expect(emitTo).toHaveBeenCalledWith('main', 'translation-history-changed')
  })

  it('keeps the translation and reports history failure separately', async () => {
    invoke.mockImplementation(command => command === 'history_record'
      ? Promise.reject(new Error('磁盘已满'))
      : Promise.resolve('你好'))
    const { result } = renderHook(() => useTextTranslation('hello'))
    await advanceTime()

    expect(result.current).toMatchObject({ result: { text: '你好' }, isLoading: false, error: null, historySaveFailed: true })
    expect(emitTo).not.toHaveBeenCalled()
  })

  it('keeps a sent history write when stopped and suppresses its late failure', async () => {
    let failSave: (error: Error) => void = () => {}
    invoke.mockImplementation(command => command === 'history_record'
      ? new Promise<void>((_resolve, reject) => { failSave = reject })
      : Promise.resolve('你好'))
    const { result } = renderHook(() => useTextTranslation('hello'))
    await advanceTime()
    expect(result.current.result?.text).toBe('你好')
    act(() => result.current.stop())
    await act(async () => failSave(new Error('磁盘已满')))

    expect(result.current).toMatchObject({ result: { text: '你好' }, isLoading: false, error: null, historySaveFailed: false })
    expect(invoke.mock.calls.filter(([command]) => command === 'history_record')).toHaveLength(1)
  })

  it('does not let a stale history failure change a newer translation in progress', async () => {
    let failOldSave: (error: Error) => void = () => {}
    let finishNew: (value: string) => void = () => {}
    invoke.mockImplementation((command, args) => {
      if (command === 'history_record') {
        return args.entry.sourceText === 'old'
          ? new Promise<void>((_resolve, reject) => { failOldSave = reject })
          : Promise.resolve()
      }
      return args.text === 'new'
        ? new Promise<string>((resolve) => { finishNew = resolve })
        : Promise.resolve('旧译文')
    })
    const { result, rerender } = renderHook(({ text }) => useTextTranslation(text), {
      initialProps: { text: 'old' },
    })
    await advanceTime()
    expect(result.current.result?.text).toBe('旧译文')
    rerender({ text: 'new' })
    await advanceTime()
    await act(async () => failOldSave(new Error('磁盘已满')))

    expect(result.current).toMatchObject({ result: null, isLoading: true, error: null, historySaveFailed: false })
    await act(async () => finishNew('新译文'))
    expect(result.current).toMatchObject({ result: { text: '新译文' }, isLoading: false, error: null, historySaveFailed: false })
  })
})
