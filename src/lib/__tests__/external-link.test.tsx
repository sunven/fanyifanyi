import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isExternalHttpUrl, useExternalLinkHandler } from '../external-link'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn(() => Promise.resolve()) }))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, isTauri: () => true }))
vi.mock('../logger', () => ({ logger: { error: vi.fn() } }))

function ExternalLinkHost() {
  useExternalLinkHandler()
  return <a href="https://github.com/sunven/fanyifanyi">external</a>
}

function InternalLinkHost() {
  useExternalLinkHandler()
  return <a href="#settings">internal</a>
}

describe('isExternalHttpUrl', () => {
  it('accepts external http and https links', () => {
    expect(isExternalHttpUrl('https://github.com/sunven/fanyifanyi')).toBe(true)
    expect(isExternalHttpUrl('http://example.com/path?q=1')).toBe(true)
  })

  it('rejects same-origin, relative and non-http links', () => {
    expect(isExternalHttpUrl('/changelog')).toBe(false)
    expect(isExternalHttpUrl(`${window.location.origin}/settings`)).toBe(false)
    expect(isExternalHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalHttpUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalHttpUrl('not a url')).toBe(false)
  })
})

describe('useExternalLinkHandler', () => {
  beforeEach(() => {
    invokeMock.mockClear()
  })

  it('opens external links instead of navigating the webview', async () => {
    render(<ExternalLinkHost />)

    const defaultAllowed = fireEvent.click(screen.getByRole('link', { name: 'external' }))

    expect(defaultAllowed).toBe(false)
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_external_url', {
        url: 'https://github.com/sunven/fanyifanyi',
      })
    })
  })

  it('leaves internal links alone', () => {
    render(<InternalLinkHost />)

    const defaultAllowed = fireEvent.click(screen.getByRole('link', { name: 'internal' }))

    expect(defaultAllowed).toBe(true)
    expect(invokeMock).not.toHaveBeenCalled()
  })
})
