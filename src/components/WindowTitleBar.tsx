import type { MouseEvent, ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { cn } from '@/lib/utils'

interface WindowTitleBarProps {
  children?: ReactNode
  title?: string
  className?: string
  controlsPosition?: 'left' | 'right'
}

interface NonMacOnlyProps {
  children: ReactNode
}

function isMacPlatform() {
  return navigator.platform.toLowerCase().includes('mac')
}

export function WindowTitleBar({ children, title, className, controlsPosition = 'left' }: WindowTitleBarProps) {
  if (!isMacPlatform()) {
    return null
  }

  const handleDrag = async (event: MouseEvent<HTMLElement>) => {
    if (event.buttons !== 1 || !isTauri()) {
      return
    }

    await getCurrentWindow().startDragging()
  }

  const controls = (
    <div
      data-testid="window-titlebar-controls"
      className="flex shrink-0 items-center gap-1"
      onMouseDown={event => event.stopPropagation()}
    >
      {children}
    </div>
  )

  return (
    <div
      data-testid="window-titlebar"
      onMouseDown={handleDrag}
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="relative flex h-full items-center px-3">
        <div
          aria-hidden="true"
          className="h-full w-[68px] shrink-0"
          data-tauri-drag-region="true"
          onMouseDown={handleDrag}
        />
        {controlsPosition === 'left' && controls}
        <div
          className="pointer-events-none absolute inset-x-28 top-0 h-full min-w-0 select-none truncate text-center text-sm font-semibold leading-10"
          data-tauri-drag-region="true"
        >
          {title}
        </div>
        <div
          className="h-full min-w-0 flex-1"
          data-tauri-drag-region="true"
          onMouseDown={handleDrag}
        />
        {controlsPosition === 'right' && controls}
      </div>
    </div>
  )
}

export function TitleBarSpacer() {
  if (!isMacPlatform()) {
    return null
  }

  return <div aria-hidden="true" className="h-10 shrink-0" />
}

export function NonMacOnly({ children }: NonMacOnlyProps) {
  if (isMacPlatform()) {
    return null
  }

  return children
}
