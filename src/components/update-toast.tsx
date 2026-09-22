import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface UpdateToastProps {
  version?: string
  onViewUpdate: () => void
  onDismiss: () => void
  className?: string
}

export function UpdateToast({
  version,
  onViewUpdate,
  onDismiss,
  className,
}: UpdateToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed right-4 bottom-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border bg-card p-4 shadow-[0_18px_40px_-24px_oklch(0.32_0.04_40/0.55)]',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">发现新版本</p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {version ? `版本 ${version} 已可用。` : '新版本已可用。'}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label="关闭更新提示"
          onClick={onDismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" size="sm" onClick={onViewUpdate}>
          查看更新
        </Button>
      </div>
    </div>
  )
}
