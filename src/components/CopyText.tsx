import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useCopyToClipboard, useTimeoutFn } from "react-use"
import { Button } from '@/components/ui/button'

export default function CopyTextButton({ text }: any) {
  const [copied, setCopied] = useState(false)
  const [_, copyToClipboard] = useCopyToClipboard();
  const [_1, _2, reset] = useTimeoutFn(() => {
    setCopied(false)
  }, 2000);
  const handleCopy = (text: string) => {
    setCopied(true)
    copyToClipboard(text)
    reset();
  }
  return <Button
    variant="ghost"
    size="sm"
    onClick={() => handleCopy(text)}
    disabled={!text}
  >
    {copied ? <Check /> : <Copy />}
    <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
  </Button>
}
