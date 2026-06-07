'use client'

import type { ComponentType, ReactNode } from 'react'
import { IconLayoutSidebarRight, IconX } from '@tabler/icons-react'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

type DockWorkspaceProps = {
  title: string
  path?: string
  icon?: ComponentType<{ size?: number | string; stroke?: number; className?: string }>
  sidebarLabel?: string
  sidebar?: ReactNode
  main: ReactNode
  onClose?: () => void
  closeLabel?: string
  sidebarClassName?: string
  sidebarDefaultSize?: string
  sidebarMinSize?: string
  scrollSidebar?: boolean
  showSidebarLabel?: boolean
  className?: string
}

export function DockWorkspace({
  title,
  icon: Icon = IconLayoutSidebarRight,
  sidebarLabel = 'Files',
  sidebar,
  main,
  onClose,
  closeLabel = 'Close dock',
  sidebarClassName,
  sidebarDefaultSize = '32%',
  sidebarMinSize = '22%',
  scrollSidebar = true,
  showSidebarLabel = true,
  className,
}: DockWorkspaceProps) {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-md bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.10)] ring-1 ring-border/30',
        className
      )}
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/35 bg-muted/20 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5 shrink-0" />
          <div className="min-w-0 truncate text-xs font-medium leading-tight text-foreground">
            {title}
          </div>
        </div>
        {onClose ? (
          <Button
            aria-label={closeLabel}
            className="-mr-1 active:scale-95"
            onClick={onClose}
            size="icon-xs"
            title={closeLabel}
            type="button"
            variant="ghost"
          >
            <IconX className="size-3.5" />
          </Button>
        ) : null}
      </header>

      {sidebar ? (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel
            id={`${title}-workspace-sidebar`}
            order={1}
            className={cn('min-h-0 min-w-0 bg-muted/15', sidebarClassName)}
            defaultSize={sidebarDefaultSize}
            minSize={sidebarMinSize}
          >
            <div className="flex h-full min-h-0 flex-col">
              {showSidebarLabel ? (
                <div className="flex h-7 shrink-0 items-center px-2 text-[10px] font-medium uppercase text-muted-foreground">
                  {sidebarLabel}
                </div>
              ) : null}
              {scrollSidebar ? (
                <ScrollArea className="min-h-0 flex-1">{sidebar}</ScrollArea>
              ) : (
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{sidebar}</div>
              )}
            </div>
          </ResizablePanel>

          <ResizableHandle className="bg-border/25 after:bg-transparent" />

          <ResizablePanel
            id={`${title}-workspace-main`}
            order={2}
            className="min-h-0 min-w-0 bg-background"
            defaultSize="68%"
            minSize="42%"
          >
            <div className="h-full min-h-0 w-full overflow-hidden">{main}</div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden bg-background">{main}</div>
      )}
    </section>
  )
}
