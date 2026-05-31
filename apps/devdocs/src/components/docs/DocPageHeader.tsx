import { ViewOptionsPopover } from 'fumadocs-ui/layouts/notebook/page'
import type { ReactNode } from 'react'

type Props = {
  markdownUrl: string
  children: ReactNode
}

export function DocPageHeader({ markdownUrl, children }: Props) {
  return (
    <div className="not-prose flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">{children}</div>
      <ViewOptionsPopover markdownUrl={markdownUrl} className="shrink-0" />
    </div>
  )
}
