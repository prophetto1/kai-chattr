'use client'

import {
  type ComponentProps,
  type ReactNode,
  useRef,
} from 'react'
import {
  IconPalette,
  IconSettings2,
  IconX,
} from '@tabler/icons-react'

import { useAppTheme } from '@/components/theme/AppThemeProvider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

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
  const {
    error: themeError,
    isLoading: themesLoading,
    isSaving: themeSaving,
    selectedTheme,
    setTheme,
    themes,
  } = useAppTheme()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const insidePointerDownRef = useRef(false)
  const selectedThemeIsAvailable = themes.some((theme) => theme.id === selectedTheme)

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

          <section className="grid min-h-0 flex-1 grid-cols-[180px_minmax(0,1fr)] bg-background">
            <aside className="border-r border-border/70 bg-muted/20 p-2">
              <button
                className="flex h-8 w-full items-center gap-2 rounded-sm bg-accent px-2 text-left text-xs font-medium text-accent-foreground"
                type="button"
              >
                <IconPalette className="size-3.5" />
                Appearance
              </button>
            </aside>
            <div className="min-w-0 overflow-auto p-5">
              <div className="max-w-xl">
                <div className="flex items-center gap-2">
                  <IconPalette className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-foreground">Appearance</h2>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4 rounded-md border border-border/70 bg-card px-4 py-3">
                  <Label className="text-sm font-medium" htmlFor="workbench-theme">
                    Theme
                  </Label>
                  <Select
                    disabled={themesLoading || themeSaving || themes.length === 0}
                    onValueChange={setTheme}
                    value={selectedThemeIsAvailable ? selectedTheme : undefined}
                  >
                    <SelectTrigger
                      aria-label="Theme"
                      className="w-[240px]"
                      id="workbench-theme"
                    >
                      <SelectValue placeholder={themesLoading ? 'Loading themes' : 'Select theme'} />
                    </SelectTrigger>
                    <SelectContent>
                      {themes.map((theme) => (
                        <SelectItem key={theme.id} value={theme.id}>
                          {theme.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {themeError ? (
                  <p className="mt-3 text-xs text-destructive">Theme settings unavailable.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
