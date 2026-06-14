'use client'

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { IconGripVertical } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'

type BoardItemRowProps = {
  actions?: ReactNode
  children?: ReactNode
  className?: string
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
  meta?: ReactNode
  status?: string
  statusClassName?: string
  style?: CSSProperties
  title: ReactNode
}

export const BoardItemRow = forwardRef<HTMLDivElement, BoardItemRowProps>(
  (
    {
      actions,
      children,
      className,
      dragHandleProps,
      isDragging,
      meta,
      status,
      statusClassName,
      style,
      title,
    },
    ref
  ) => (
    <div
      className={cn(
        'group relative rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-xs transition-colors',
        'hover:border-border hover:bg-accent/20',
        isDragging ? 'z-[1000] opacity-90 shadow-xl ring-1 ring-ring/40' : '',
        className
      )}
      ref={ref}
      style={{ ...style, zIndex: isDragging ? 1000 : style?.zIndex }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {dragHandleProps ? (
          <Button
            aria-label="Drag item"
            className="size-5 shrink-0 cursor-grab p-0 active:cursor-grabbing"
            size="icon"
            type="button"
            variant="ghost"
            {...dragHandleProps}
          >
            <IconGripVertical className="size-3" />
          </Button>
        ) : null}
        {status ? (
          <Badge className={cn('h-[18px] shrink-0 rounded-[4px] px-1.5', statusClassName)} style={typographyStyle('ui.micro')}>
            {status}
          </Badge>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-sm leading-5">{title}</div>
          {meta ? <div className="mt-0.5 text-muted-foreground" style={typographyStyle('ui.caption')}>{meta}</div> : null}
        </div>
        {actions ? <div className="ml-1 shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-2 pl-0">{children}</div> : null}
    </div>
  )
)

BoardItemRow.displayName = 'BoardItemRow'
