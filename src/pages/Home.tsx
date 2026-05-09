import { Settings as SettingsIcon, X } from 'lucide-react'
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
import Settings from './Settings'

export default function TranslationApp() {
  const [sourceText, setSourceText] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialSection, setSettingsInitialSection] = useState<'updates' | undefined>()
  const [toastVersion, setToastVersion] = useState<string | null>(null)
  const [lastPromptedVersion, setLastPromptedVersion] = useState<string | null>(null)
  const { hasUpdate, updateInfo } = useUpdate()

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

  if (showSettings) {
    return <Settings onBack={handleCloseSettings} initialSection={settingsInitialSection} />
  }

  return (
    <div className="flex flex-col h-screen">
      <WindowTitleBar title="fanyifanyi">
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
      <Tabs defaultValue="translate" className="flex flex-col h-full">
        <div className="flex justify-center items-center p-1">
          <TabsList>
            <TabsTrigger value="translate">翻译</TabsTrigger>
            <TabsTrigger value="dict">词典</TabsTrigger>
          </TabsList>
        </div>
        <div className="flex gap-2 flex-1 overflow-hidden px-4 pb-4">
          <div className="w-[350px] flex flex-col space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">源文本</label>
              <CopyTextButton text={sourceText} />
            </div>
            <div className="relative flex-1 p-1">
              <Textarea
                placeholder="输入要翻译的文本..."
                className="resize-none h-full field-sizing-fixed overflow-y-auto"
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
              />
              {sourceText && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 h-6 w-6 p-0 bg-background/80 backdrop-blur-sm border"
                  onClick={() => { setSourceText('') }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <TabsContent value="translate" className="flex-1 overflow-hidden">
              <TranslateDisplay q={sourceText} />
            </TabsContent>
            <TabsContent value="dict" className="flex-1 overflow-hidden"><DictionaryDisplay q={sourceText} /></TabsContent>
          </div>
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
  )
}
