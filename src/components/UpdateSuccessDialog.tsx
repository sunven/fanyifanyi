import type { UpdateSuccessInfo } from '@/lib/updater'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

interface UpdateSuccessDialogProps {
  open: boolean
  successInfo: UpdateSuccessInfo | null
  onDismiss: () => void
}

export function UpdateSuccessDialog({
  open,
  successInfo,
  onDismiss,
}: UpdateSuccessDialogProps) {
  if (!successInfo?.wasUpdated) {
    return null
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-green-600 dark:text-green-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            更新成功
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <div>
              应用已成功更新到版本
              {' '}
              <span className="font-semibold text-foreground">
                {successInfo.currentVersion}
              </span>
            </div>
            {successInfo.previousVersion !== 'unknown' && (
              <div className="text-xs text-muted-foreground">
                从版本
                {' '}
                {successInfo.previousVersion}
                {' '}
                更新
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogAction onClick={onDismiss}>
            好的
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
