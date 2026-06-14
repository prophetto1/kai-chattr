'use client'

import { type ReactNode } from 'react'

import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { AppShell } from '@/components/layout/AppShell'
import { Sheet } from '@/components/layout/Sheet'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { type WorkbenchCompactRailItem } from '@/components/workbench/WorkbenchCompactRail'
import { typographyStyle } from '@/lib/design-system'

type ProductSectionPageProps = {
  activeItem: WorkbenchCompactRailItem
  children?: ReactNode
  description: string
  route: string
  scope: 'current user' | 'workspace' | 'workspace session'
  title: string
}

export function ProductSectionPage({
  activeItem,
  children,
  description,
  route,
  scope,
  title,
}: ProductSectionPageProps) {
  return (
    <AppShell rail={<KaiAppRail activeItem={activeItem} />}>
      <Sheet className="min-h-0 min-w-0 flex-1">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
          <div className="min-w-0">
            <h1 className="truncate" style={typographyStyle('ui.body-strong')}>{title}</h1>
            <p className="truncate text-muted-foreground" style={typographyStyle('ui.caption')}>{description}</p>
          </div>
          <Badge className="rounded-[5px]" style={typographyStyle('code.stat')} variant="outline">
            {route}
          </Badge>
        </header>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
          <div className="mx-auto grid w-full max-w-[1000px] gap-5 px-6 py-7">
            <section className="overflow-hidden rounded-[10px] border border-border bg-card">
              <div className="px-5 py-3.5">
                <p className="mb-0.5 text-muted-foreground" style={typographyStyle('ui.overline')}>
                  Route contract
                </p>
                <h2 className="text-sm font-semibold">{title}</h2>
              </div>
              <Separator className="bg-border" />
              <div className="divide-y divide-border">
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div style={typographyStyle('ui.body-strong')}>Scope</div>
                    <p className="mt-1 max-w-[58ch] text-muted-foreground" style={typographyStyle('ui.caption')}>
                      {scope}
                    </p>
                  </div>
                  <Badge variant="secondary">{scope}</Badge>
                </div>
                <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div style={typographyStyle('ui.body-strong')}>Browser route</div>
                    <p className="mt-1 max-w-[58ch] text-muted-foreground" style={typographyStyle('code.inline')}>
                      {route}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            {children}
          </div>
        </ScrollArea>
      </Sheet>
    </AppShell>
  )
}
