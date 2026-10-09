import type { TranslationTarget } from './config'
import type { TranslationResult } from './translate'
import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { recordTranslation } from './history'
import { translate, TranslationError } from './translate'

export function useTextTranslation(
  text: string,
  { startDelay = 1000, clipboardSessionId }: { startDelay?: number, clipboardSessionId?: number } = {},
) {
  const [result, setResult] = useState<TranslationResult | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [historySaveFailed, setHistorySaveFailed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const retryTargetRef = useRef<TranslationTarget | undefined>()

  const retry = useCallback(async (target?: TranslationTarget) => {
    if (!text.trim())
      return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const { signal } = controller
    const selected = target ?? retryTargetRef.current
    retryTargetRef.current = selected
    setIsLoading(true)
    setError(null)
    setHistorySaveFailed(false)
    setResult(null)
    try {
      const translated = await translate(text, 'desk', signal, selected)
      if (clipboardSessionId !== undefined && !await invoke<boolean>('is_clipboard_translation_current', { id: clipboardSessionId }))
        return
      if (signal.aborted || !translated)
        return
      setResult(translated)
      try {
        await recordTranslation(text, 'desk', translated, clipboardSessionId)
      }
      catch {
        if (!signal.aborted)
          setHistorySaveFailed(true)
      }
    }
    catch (err) {
      if (signal.aborted)
        return
      if (err instanceof TranslationError)
        retryTargetRef.current = err.engine
      setError(err instanceof Error ? err : new Error(String(err)))
    }
    finally {
      if (!signal.aborted)
        setIsLoading(false)
    }
  }, [text, clipboardSessionId])

  useEffect(() => {
    retryTargetRef.current = undefined
    setResult(null)
    setError(null)
    setHistorySaveFailed(false)
    setIsLoading(false)
    const timer = setTimeout(() => {
      void retry()
    }, startDelay)
    return () => {
      clearTimeout(timer)
      controllerRef.current?.abort()
    }
  }, [retry, startDelay])

  const stop = () => {
    controllerRef.current?.abort()
    setIsLoading(false)
  }

  return { result, error, historySaveFailed, isLoading, retry, stop }
}
