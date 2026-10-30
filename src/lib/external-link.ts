import { invoke, isTauri } from '@tauri-apps/api/core'
import { useEffect } from 'react'
import { logger } from './logger'

export function isExternalHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && url.origin !== window.location.origin
  }
  catch {
    return false
  }
}

export async function openExternalUrl(rawUrl: string): Promise<void> {
  try {
    if (isTauri()) {
      await invoke('open_external_url', { url: rawUrl })
      return
    }
    window.open(rawUrl, '_blank', 'noopener,noreferrer')
  }
  catch (error) {
    logger.error('openExternalUrl', error)
  }
}

// Keep the webview from navigating away: any external link opens in the
// system browser instead of replacing the app UI.
export function useExternalLinkHandler(): void {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const href = target.closest('a[href]')?.getAttribute('href')
      if (!href || !isExternalHttpUrl(href)) {
        return
      }

      event.preventDefault()
      void openExternalUrl(href)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])
}
