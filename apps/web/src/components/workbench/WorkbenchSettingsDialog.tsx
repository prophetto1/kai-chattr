'use client'

import {
  type ComponentProps,
  type ReactNode,
  useRef,
} from 'react'
import {
  IconSettings2,
  IconX,
} from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type DialogContentPointerDownOutsideEvent = Parameters<
  NonNullable<ComponentProps<typeof DialogContent>['onPointerDownOutside']>
>[0]

function outsideEventTargetIsInsideDialog(
  event: DialogContentPointerDownOutsideEvent,
  surface: HTMLElement | null
) {
  const originalEventTarget = event.detail.originalEvent.target

  return originalEventTarget instanceof Node && surface?.contains(originalEventTarget)
}

export function WorkbenchSettingsDialog({
  onOpenChange,
  open,
  trigger,
}: {
  onOpenChange?: (open: boolean) => void
  open?: boolean
  trigger?: ReactNode | null
} = {}) {
  const contentRef = useRef<HTMLDivElement | null>(null)
  const insidePointerDownRef = useRef(false)

  const dialogTrigger = trigger ?? (
    <Button
      aria-label="Settings"
      className="active:scale-95"
      size="icon-xs"
      title="Settings"
      type="button"
      variant="ghost"
    >
      <IconSettings2 />
    </Button>
  )
  const closeDialog = () => {
    insidePointerDownRef.current = false
    onOpenChange?.(false)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange?.(true)
      return
    }

    const shouldClose = !insidePointerDownRef.current
    insidePointerDownRef.current = false

    if (shouldClose) {
      onOpenChange?.(false)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      {trigger !== null && <DialogTrigger asChild>{dialogTrigger}</DialogTrigger>}
      <DialogContent
        className="flex h-[min(720px,calc(100dvh-2rem))] min-h-[430px] !w-[calc(100vw-2rem)] min-w-0 !max-w-none resize flex-col gap-0 overflow-hidden rounded-md border-border/80 bg-card p-0 shadow-2xl sm:!w-[min(1120px,calc(100vw-2rem))] sm:min-w-[680px] sm:!max-w-none"
        onEscapeKeyDown={() => {
          insidePointerDownRef.current = false
        }}
        onPointerDownOutside={(event) => {
          if (outsideEventTargetIsInsideDialog(event, contentRef.current)) {
            event.preventDefault()
            return
          }

          event.preventDefault()
          closeDialog()
        }}
        onPointerDownCapture={() => {
          insidePointerDownRef.current = true
        }}
        ref={contentRef}
        showCloseButton={false}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border/80 bg-muted/30 px-2">
            <div className="flex min-w-0 items-center gap-2 rounded-sm px-1.5 text-xs text-muted-foreground">
              <IconSettings2 className="size-3.5" />
              <DialogTitle className="truncate text-xs font-medium text-foreground">
                Settings
              </DialogTitle>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Button
                aria-label="Close settings"
                className="size-6 active:scale-95"
                onClick={closeDialog}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconX className="size-3.5" />
              </Button>
            </div>
          </header>

          <section className="min-h-0 flex-1 bg-background" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
