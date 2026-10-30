import type { ProgressEvent } from './updater'

export interface DownloadProgressTracker {
  handle: (event: ProgressEvent) => number | null
}

export function createDownloadProgressTracker(): DownloadProgressTracker {
  let downloaded = 0
  let total = 0

  return {
    handle(event) {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
        return total > 0 ? 0 : null
      }

      if (event.event === 'Progress') {
        downloaded += event.data.chunkLength ?? 0
        return total > 0
          ? Math.min(100, Math.round((downloaded / total) * 100))
          : null
      }

      return 100
    },
  }
}
