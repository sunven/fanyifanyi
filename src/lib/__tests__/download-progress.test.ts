import { describe, expect, it } from 'vitest'
import { createDownloadProgressTracker } from '../download-progress'

describe('createDownloadProgressTracker', () => {
  it('reports 0-100 progress when the total size is known', () => {
    const tracker = createDownloadProgressTracker()

    expect(tracker.handle({ event: 'Started', data: { contentLength: 200 } })).toBe(0)
    expect(tracker.handle({ event: 'Progress', data: { chunkLength: 90 } })).toBe(45)
    expect(tracker.handle({ event: 'Progress', data: { chunkLength: 10 } })).toBe(50)
    expect(tracker.handle({ event: 'Finished', data: {} })).toBe(100)
  })

  it('stays indeterminate when the total size is unknown', () => {
    const tracker = createDownloadProgressTracker()

    expect(tracker.handle({ event: 'Started', data: {} })).toBeNull()
    expect(tracker.handle({ event: 'Progress', data: { chunkLength: 10 } })).toBeNull()
    expect(tracker.handle({ event: 'Finished', data: {} })).toBe(100)
  })

  it('clamps progress to 100 when chunks overshoot the total', () => {
    const tracker = createDownloadProgressTracker()

    tracker.handle({ event: 'Started', data: { contentLength: 10 } })
    expect(tracker.handle({ event: 'Progress', data: { chunkLength: 20 } })).toBe(100)
  })
})
