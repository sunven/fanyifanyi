import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from '../Settings'

const { testAIConfig } = vi.hoisted(() => ({
  testAIConfig: vi.fn(),
}))

vi.mock('@/lib/ai', () => ({
  testAIConfig,
}))

vi.mock('@/contexts/UpdateContext', () => {
  const getMockUpdateContext = () => ({
    hasUpdate: false,
    updateInfo: null,
    updateHandle: null,
    isChecking: false,
    isDownloading: false,
    error: null,
    isDismissed: false,
    isDevMode: false,
    checkUpdate: vi.fn(),
    dismissUpdate: vi.fn(),
    resetDismiss: vi.fn(),
    downloadAndInstall: vi.fn(),
    retryDownload: vi.fn(),
    clearError: vi.fn(),
  })

  return {
    getCurrentVersion: () => new Promise<string>(() => {}),
    useUpdate: getMockUpdateContext,
  }
})

function saveConfigWithApiKey() {
  localStorage.setItem(
    'ai_configs',
    JSON.stringify({
      activeModelId: 'model-1',
      translationProvider: 'ai',
      models: [
        {
          id: 'model-1',
          name: 'DeepSeek V3',
          baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
          apiKey: 'sk-test-key',
          model: 'ep-20251028141454-jlhp4',
        },
      ],
    }),
  )
}

describe('settings model configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    testAIConfig.mockReset()
    saveConfigWithApiKey()
  })

  it('keeps the API key visibility button next to the key value', async () => {
    render(<Settings />)

    const showKeyButton = await screen.findByRole('button', { name: '显示 API Key' })
    const keyValue = await screen.findByText('••••••••')
    const keyControl = showKeyButton.parentElement

    expect(keyControl).toContainElement(keyValue)
    expect(keyControl).toHaveClass('inline-flex')
  })

  it('tests a model configuration and shows a success result', async () => {
    testAIConfig.mockResolvedValue(undefined)
    render(<Settings />)

    fireEvent.click(await screen.findByRole('button', { name: '测试' }))

    await waitFor(() => expect(testAIConfig).toHaveBeenCalledTimes(1))
    expect(testAIConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model-1',
        apiKey: 'sk-test-key',
        model: 'ep-20251028141454-jlhp4',
      }),
      expect.any(AbortSignal),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('测试通过')
  })

  it('shows the model test error message', async () => {
    testAIConfig.mockRejectedValue(new Error('认证失败'))
    render(<Settings />)

    fireEvent.click(await screen.findByRole('button', { name: '测试' }))

    expect(await screen.findByText('认证失败')).toBeInTheDocument()
  })

  it('shows an actionable message for SDK connection errors', async () => {
    testAIConfig.mockRejectedValue(new Error('Connection error.'))
    render(<Settings />)

    fireEvent.click(await screen.findByRole('button', { name: '测试' }))

    expect(await screen.findByText('连接失败：无法访问 API Base URL。请检查地址、网络、代理设置，或服务商是否允许当前环境访问。')).toBeInTheDocument()
  })

  it('does not mix test results between model cards', async () => {
    localStorage.setItem(
      'ai_configs',
      JSON.stringify({
        activeModelId: 'model-1',
        translationProvider: 'ai',
        models: [
          {
            id: 'model-1',
            name: 'DeepSeek V3',
            baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
            apiKey: 'sk-test-key',
            model: 'ep-20251028141454-jlhp4',
          },
          {
            id: 'model-2',
            name: 'GPT Test',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-other-key',
            model: 'gpt-4o-mini',
          },
        ],
      }),
    )
    testAIConfig.mockResolvedValue(undefined)
    render(<Settings />)

    const secondCard = (await screen.findByText('GPT Test')).closest('[data-slot="card"]')
    expect(secondCard).not.toBeNull()

    fireEvent.click(within(secondCard as HTMLElement).getByRole('button', { name: '测试' }))

    await waitFor(() => expect(testAIConfig).toHaveBeenCalledTimes(1))
    expect(within(secondCard as HTMLElement).getByRole('status')).toHaveTextContent('测试通过')
    expect(screen.getAllByText('测试通过')).toHaveLength(1)
  })

  it('switches the translation provider to Google', async () => {
    render(<Settings />)

    fireEvent.click(await screen.findByRole('combobox', { name: '翻译引擎' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Google 翻译' }))

    expect(await screen.findByText('当前使用第三方翻译接口；下方 AI 模型配置会保留，用于切回 AI 翻译时继续使用。')).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.translationProvider).toBe('google')
  })

  it('switches the translation provider to Microsoft', async () => {
    render(<Settings />)

    fireEvent.click(await screen.findByRole('combobox', { name: '翻译引擎' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Microsoft 翻译' }))

    expect(await screen.findByText('当前使用第三方翻译接口；下方 AI 模型配置会保留，用于切回 AI 翻译时继续使用。')).toBeInTheDocument()

    const stored = JSON.parse(localStorage.getItem('ai_config_metadata_v1') ?? '{}')
    expect(stored.translationProvider).toBe('microsoft')
  })
})
