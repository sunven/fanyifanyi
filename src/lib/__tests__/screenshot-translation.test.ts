import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteScreenshotFile, readSelectionWindowParams } from '../screenshot-translation'

const { invoke } = vi.hoisted(() => {
  return {
    invoke: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
  invoke,
}))

describe('screenshot translation session helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a captured screenshot through the backend command', async () => {
    await deleteScreenshotFile('/tmp/fanyifanyi-screen-test.png')

    expect(invoke).toHaveBeenCalledWith('delete_screenshot_file', {
      imagePath: '/tmp/fanyifanyi-screen-test.png',
    })
  })

  it('reads the pre-captured screenshot path from selection window params', () => {
    expect(readSelectionWindowParams('?imagePath=%2Ftmp%2Fshot.png&screenX=1&screenY=2&screenWidth=3&screenHeight=4&scaleFactor=2&logicalX=5&logicalY=6&logicalWidth=7&logicalHeight=8')).toMatchObject({
      imagePath: '/tmp/shot.png',
      screenX: 1,
      logicalWidth: 7,
    })
  })
})
