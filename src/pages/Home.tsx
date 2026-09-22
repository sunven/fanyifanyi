import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ScanText, Settings as SettingsIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import CopyTextButton from '@/components/CopyText'
import DictionaryDisplay from '@/components/dictionary-display'
import TranslateDisplay from '@/components/translate-display'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { UpdateToast } from '@/components/update-toast'
import { TitleBarSpacer, WindowTitleBar } from '@/components/WindowTitleBar'
import { useUpdate } from '@/contexts/UpdateContext'
import { destroyScreenshotWindows, openScreenshotSelectionWindow } from '@/lib/screenshot-translation'
import Settings from './Settings'

export default function TranslationApp() {
  const [sourceText, setSourceText] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<'updates' | undefined>()
  const [toastVersion, setToastVersion] = useState<string | null>(null)
  const [lastPromptedVersion, setLastPromptedVersion] = useState<string | null>(null)
  const [screenshotError, setScreenshotError] = useState('')
  const { hasUpdate, updateInfo } = useUpdate()

  useEffect(() => {
    if (!isTauri()) {
      return
    }

    const appWindow = getCurrentWindow()
    let disposed = false
    let unlisten: (() => void) | undefined

    void appWindow.onCloseRequested(async (event) => {
      event.preventDefault()
      try {
        await destroyScreenshotWindows()
      }
      finally {
        await appWindow.destroy()
      }
    }).then((stopListening) => {
      if (disposed) {
        stopListening()
      }
      else {
        unlisten = stopListening
      }
    }).catch((err) => {
      if (!disposed) {
        console.error('无法注册截图窗口清理监听', err)
      }
    })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  useEffect(() => {
    const version = updateInfo?.version
    if (!hasUpdate || !version) {
      setToastVersion(null)
      return
    }

    if (version === lastPromptedVersion) {
      return
    }

    setToastVersion(version)
    setLastPromptedVersion(version)
  }, [hasUpdate, lastPromptedVersion, updateInfo?.version])

  const handleViewUpdate = () => {
    setToastVersion(null)
    setSettingsInitialSection('updates')
    setShowSettings(true)
  }

  const handleCloseSettings = () => {
    setShowSettings(false)
    setSettingsInitialSection(undefined)
  }

  const handleScreenshotTranslation = async () => {
    setScreenshotError('')
    try {
      await openScreenshotSelectionWindow()
    }
    catch (err) {
      setScreenshotError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <a
        href="#workspace"
        className="sr-only focus:not-sr-only focus:fixed focus:top-12 focus:left-3 focus:z-40 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        跳到正文
      </a>
      <div className="flex h-dvh flex-col" hidden={showSettings}>
        <WindowTitleBar title="fanyifanyi" controlsPosition="right">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleScreenshotTranslation}
            className="h-7 px-2 text-xs"
          >
            <ScanText className="h-4 w-4" />
            截图翻译
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(true)}
            className="h-7 px-2 text-xs"
          >
            <SettingsIcon className="h-4 w-4" />
            AI 配置
          </Button>
        </WindowTitleBar>
        <TitleBarSpacer />
        {screenshotError && (
          <div role="alert" className="mx-4 mt-3 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {screenshotError}
          </div>
        )}
        <Tabs defaultValue="translate" className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex items-center px-4 pt-3">
            <TabsList>
              <TabsTrigger value="translate">翻译</TabsTrigger>
              <TabsTrigger value="dict">词典</TabsTrigger>
            </TabsList>
          </div>
          <div id="workspace" className="grid min-h-0 flex-1 grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 overflow-hidden px-4 pt-3 pb-5 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] md:grid-rows-1">
            <section className="flex min-h-0 flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="source-text" className="text-xs font-medium tracking-wide text-muted-foreground">源文本</label>
                <CopyTextButton text={sourceText} />
              </div>
              <div className="relative min-h-0 flex-1">
                <Textarea
                  id="source-text"
                  placeholder="输入要翻译的文本..."
                  className="h-full resize-none overflow-y-auto bg-card/80 text-base leading-7 field-sizing-fixed md:text-base"
                  value={sourceText}
                  onChange={e => setSourceText(e.target.value)}
                />
                {sourceText && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="清空源文本"
                    className="absolute top-2 right-2 h-6 w-6 border bg-background/80 p-0 backdrop-blur-sm"
                    onClick={() => { setSourceText('') }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </section>
            <section className="flex min-h-0 flex-col overflow-hidden rounded-lg bg-card shadow-[0_1px_0_oklch(0.35_0.02_55/0.05),0_18px_36px_-28px_oklch(0.32_0.04_40/0.55)]">
              <TabsContent value="translate" className="min-h-0 flex-1 overflow-hidden">
                <TranslateDisplay q={sourceText} />
              </TabsContent>
              <TabsContent value="dict" className="min-h-0 flex-1 overflow-hidden"><DictionaryDisplay q={sourceText} /></TabsContent>
            </section>
          </div>
        </Tabs>
        {toastVersion && (
          <UpdateToast
            version={toastVersion}
            onViewUpdate={handleViewUpdate}
            onDismiss={() => setToastVersion(null)}
          />
        )}
      </div>
      {showSettings && (
        <Settings onBack={handleCloseSettings} initialSection={settingsInitialSection} />
      )}
    </>
  )
}
