import { Settings as SettingsIcon, X } from 'lucide-react'
import { useState } from 'react'
import CopyTextButton from '@/components/CopyText'
import DictionaryDisplay from '@/components/dictionary-display'
import TranslateDisplay from '@/components/translate-display'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import Settings from './Settings'

export default function TranslationApp() {
  const [sourceText, setSourceText] = useState('')
  const [showSettings, setShowSettings] = useState(false)

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />
  }

  return (
    <div className="flex flex-col h-screen p-4">
      <Tabs defaultValue="translate" className="flex flex-col h-full">
        <div className="flex justify-between items-center mb-2">
          <div className="w-[88px]"></div>
          <TabsList>
            <TabsTrigger value="translate">翻译</TabsTrigger>
            <TabsTrigger value="dict">词典</TabsTrigger>
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(true)}
          >
            <SettingsIcon className="h-4 w-4 mr-1" />
            AI 配置
          </Button>
        </div>
        <div className="flex gap-4 flex-1 overflow-hidden">
          <div className="w-[350px] flex flex-col space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">源文本</label>
              <CopyTextButton text={sourceText} />
            </div>
            <div className="relative flex-1 p-1">
              <Textarea
                placeholder="输入要翻译的文本..."
                className="resize-none h-full"
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
    </div>
  )
}
