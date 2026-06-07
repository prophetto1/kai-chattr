'use client'

import { type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

import { cn } from '@/lib/cn'

type BoardDropZoneProps = {
  children: ReactNode
  className?: string
  disabled?: boolean
  id: string
}

export function BoardDropZone({ children, className, disabled, id }: BoardDropZoneProps) {
  const { isOver, setNodeRef } = useDroppable({
    disabled,
    id,
  })

  return (
    <div
      className={cn(
        'rounded-md transition-colors data-[over=true]:bg-accent/40',
        className
      )}
      data-over={isOver ? 'true' : 'false'}
      ref={setNodeRef}
    >
      {children}
    </div>
  )
}
