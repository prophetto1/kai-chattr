'use client'

import { useState, type ReactNode } from 'react'
import {
  IconAlertTriangle,
  IconArchive,
  IconBellRinging,
  IconCheck,
  IconCircle,
  IconCircleCheck,
  IconEdit,
  IconLoader2,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconTrash,
  IconX,
} from '@tabler/icons-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'

type RuleStatus = 'active' | 'draft' | 'archived'

type RulePreview = {
  id: number
  status: RuleStatus
  title: string
  body: string
  meta: string
  sync: string
}

const activeRules: RulePreview[] = [
  {
    id: 1,
    status: 'active',
    title: 'Keep backend schema durable',
    body: 'Agents must use API-owned Postgres stores before UI state is considered real.',
    meta: 'by jon - synced to agents - 2m ago',
    sync: 'synced',
  },
  {
    id: 2,
    status: 'active',
    title: 'Visual states must be verified',
    body: 'Every Board tab needs screenshot states before a production replacement lands.',
    meta: 'by codex - waiting for reminder',
    sync: 'stale',
  },
]

const draftRules: RulePreview[] = [
  {
    id: 3,
    status: 'draft',
    title: 'Saved draft from create',
    body: 'Define the Rules state matrix before replacing the production BoardDock.',
    meta: 'draft - saved 1m ago',
    sync: 'draft',
  },
  {
    id: 4,
    status: 'draft',
    title: 'Create workflow state matrix',
    body: 'Define list, create, edit, empty, error, loading, and archive states before code edits.',
    meta: 'draft - not injected',
    sync: 'draft',
  },
]

const archivedRules: RulePreview[] = [
  {
    id: 5,
    status: 'archived',
    title: 'Legacy static UI is reference only',
    body: 'Do not port legacy static UI as the visual target.',
    meta: 'archived - 5d ago',
    sync: 'inactive',
  },
]

function RuleStatusLabel({ status }: { status: RuleStatus }) {
  if (status === 'active') {
    return (
      <Badge className="border-emerald-500/20 bg-emerald-500/12 text-emerald-300" variant="outline">
        <IconCircleCheck className="size-3" />
        active
      </Badge>
    )
  }
  if (status === 'archived') {
    return (
      <Badge className="border-border/50 bg-muted/40 text-muted-foreground" variant="outline">
        archived
      </Badge>
    )
  }
  return (
    <Badge className="border-sky-500/20 bg-sky-500/12 text-sky-300" variant="outline">
      <IconCircle className="size-3" />
      draft
    </Badge>
  )
}

function RuleRow({
  dimmed,
  editing,
  showActions = true,
  rule,
}: {
  dimmed?: boolean
  editing?: boolean
  showActions?: boolean
  rule: RulePreview
}) {
  const actions =
    rule.status === 'active' ? (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Edit rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconEdit className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit rule</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Remind agents" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconBellRinging className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remind agents</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Return to draft" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconCircle className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Return to draft</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Archive rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconArchive className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive rule</TooltipContent>
        </Tooltip>
      </>
    ) : rule.status === 'archived' ? (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Restore as active" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconCircleCheck className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restore as active</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Restore as draft" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconRestore className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Restore as draft</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Delete rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconTrash className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete rule</TooltipContent>
        </Tooltip>
      </>
    ) : (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Edit rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconEdit className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Edit rule</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Activate rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconCheck className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Activate rule</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="Archive rule" className="active:scale-95" size="icon-xs" variant="ghost">
              <IconArchive className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Archive rule</TooltipContent>
        </Tooltip>
      </>
    )

  return (
    <Card
      className={cn(
        'gap-0 rounded-lg border-border/60 bg-background/55 py-0 shadow-none transition-colors',
        dimmed && 'opacity-55',
        editing && 'border-primary/35 bg-primary/5'
      )}
    >
      <CardContent className="px-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="pt-0.5">
            <RuleStatusLabel status={rule.status} />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="max-w-[44rem] text-sm font-medium leading-5 text-foreground">
                  {rule.body}
                </p>
              </div>
              {showActions ? (
                <div className="flex shrink-0 items-center gap-1 sm:self-start">{actions}</div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground" style={typographyStyle('ui.caption')}>
              <span>{rule.meta}</span>
              <span className="size-1 rounded-full bg-border" />
              <span>{rule.sync}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function RuleSection({
  children,
  count,
  label,
}: {
  children: ReactNode
  count: number
  label: string
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2 text-muted-foreground" style={typographyStyle('ui.overline')}>
        <span>{label}</span>
        <Badge className="h-4 min-w-4 px-1" style={typographyStyle('ui.micro')} variant="secondary">
          {count}
        </Badge>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function RuleFormActions() {
  return (
    <div className="flex justify-end gap-2">
      <Button
        className="border-destructive/35 text-destructive hover:bg-destructive/10 active:scale-95"
        size="sm"
        variant="outline"
      >
        <IconX className="size-4" />
        Cancel
      </Button>
      <Button className="active:scale-95" size="sm">
        Save
      </Button>
    </div>
  )
}

function RulesBoardFrame({
  children,
  rulesCount,
  title,
}: {
  children: ReactNode
  rulesCount: number
  title: string
}) {
  return (
    <Card className="h-[680px] gap-0 overflow-hidden rounded-lg border-border/70 bg-card py-0 shadow-sm">
      <CardHeader className="border-b border-border/60 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <Button aria-label="Refresh rules" className="active:scale-95" size="icon-sm" variant="ghost">
            <IconRefresh className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <div className="border-b border-border/60 px-4">
        <Tabs value="rules">
          <TabsList className="h-10 w-full justify-start rounded-none bg-transparent p-0" variant="line">
            <TabsTrigger className="h-10 flex-none px-1.5 text-xs" value="rules">
              Rules <Badge variant="secondary">{rulesCount}</Badge>
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-1.5 text-xs" value="decisions">
              Decisions <Badge variant="secondary">1</Badge>
            </TabsTrigger>
            <TabsTrigger className="h-10 flex-none px-1.5 text-xs" value="pins">
              Pinned <Badge variant="secondary">4</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <ScrollArea className="h-[585px]">
        <div className="space-y-4 p-4">{children}</div>
      </ScrollArea>
    </Card>
  )
}

function DefaultState() {
  return (
    <RulesBoardFrame rulesCount={4} title="Default list state">
      <div className="flex justify-end">
        <Button className="active:scale-95" size="sm">
          <IconPlus className="size-4" />
          Create rule
        </Button>
      </div>
      <RuleSection count={2} label="Active">
        {activeRules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </RuleSection>
      <RuleSection count={2} label="Drafts">
        {draftRules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </RuleSection>
      <Separator />
      <Button className="w-full justify-between active:scale-95" size="sm" variant="ghost">
        Archive
        <Badge variant="secondary">collapsed</Badge>
      </Button>
    </RulesBoardFrame>
  )
}

function CreateState() {
  return (
    <RulesBoardFrame rulesCount={4} title="Create state">
      <Card className="gap-0 rounded-lg border-primary/35 bg-primary/5 py-0 shadow-none">
        <CardHeader className="px-3 py-3">
          <CardTitle className="text-sm">Create rule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-3 pb-3">
          <Textarea
            className="min-h-28 resize-none"
            id="create-rule-text"
            placeholder="Write the rule..."
            value="Define the Rules state matrix before replacing the production BoardDock."
            readOnly
          />
          <RuleFormActions />
        </CardContent>
      </Card>
    </RulesBoardFrame>
  )
}

function EditState() {
  return (
    <RulesBoardFrame rulesCount={4} title="Edit state">
      <Card className="gap-0 rounded-lg border-primary/40 bg-primary/5 py-0 shadow-none">
        <CardContent className="space-y-3 px-3 py-3">
          <Textarea
            className="min-h-28 resize-none"
            id="edit-rule-text"
            value="Agents must use API-owned Postgres stores before UI state is considered real."
            readOnly
          />
          <RuleFormActions />
        </CardContent>
      </Card>
    </RulesBoardFrame>
  )
}

function EmptyState() {
  return (
    <RulesBoardFrame rulesCount={0} title="Empty state">
      <Card className="gap-0 rounded-lg border-dashed border-border/80 bg-background/45 py-0 text-center shadow-none">
        <CardContent className="flex min-h-[360px] flex-col items-center justify-center gap-4 px-8 py-10">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <IconPlus className="size-5" />
          </div>
          <div className="max-w-sm space-y-1.5">
            <h3 className="text-sm font-semibold text-foreground">No rules yet</h3>
          </div>
          <Button className="active:scale-95" size="sm">
            Create first rule
          </Button>
        </CardContent>
      </Card>
    </RulesBoardFrame>
  )
}

function ErrorState() {
  return (
    <RulesBoardFrame rulesCount={0} title="Error state">
      <Alert className="border-destructive/35 bg-destructive/5" variant="destructive">
        <IconAlertTriangle className="size-4" />
        <AlertTitle>Could not load rules</AlertTitle>
        <AlertDescription>
          Session token rejected by /api/rules. The list is not current.
        </AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <Button className="active:scale-95" size="sm" variant="outline">
          <IconRefresh className="size-4" />
          Retry
        </Button>
      </div>
      <RuleSection count={0} label="Last known state">
        {activeRules.map((rule) => (
          <RuleRow dimmed key={rule.id} rule={rule} />
        ))}
      </RuleSection>
    </RulesBoardFrame>
  )
}

function LoadingState() {
  return (
    <RulesBoardFrame rulesCount={0} title="Loading state">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Button disabled size="sm" variant="outline">
          <IconLoader2 className="size-4 animate-spin" />
          Loading
        </Button>
      </div>
      <RuleSection count={0} label="Active">
        <Skeleton className="h-[92px] w-full" />
        <Skeleton className="h-[92px] w-full" />
      </RuleSection>
      <RuleSection count={0} label="Drafts">
        <Skeleton className="h-[92px] w-full" />
      </RuleSection>
    </RulesBoardFrame>
  )
}

function ArchiveState() {
  return (
    <RulesBoardFrame rulesCount={1} title="Archive state">
      <RuleSection count={1} label="Archived">
        {archivedRules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} />
        ))}
      </RuleSection>
    </RulesBoardFrame>
  )
}

export function BoardRulesVisualStates() {
  const [activeState, setActiveState] = useState('default')
  const statePreview =
    activeState === 'create' ? (
      <CreateState />
    ) : activeState === 'edit' ? (
      <EditState />
    ) : activeState === 'empty' ? (
      <EmptyState />
    ) : activeState === 'error' ? (
      <ErrorState />
    ) : activeState === 'loading' ? (
      <LoadingState />
    ) : activeState === 'archive' ? (
      <ArchiveState />
    ) : (
      <DefaultState />
    )

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background p-4 text-foreground md:p-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <header className="border-b border-border/60 pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">
                kai-chattr Board
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-normal text-foreground">
                Rules visual state review
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                One Rules design rendered across state changes. The state selector is only for this
                review page; production Board keeps one state at a time.
              </p>
            </div>
          </header>

          <Tabs className="gap-4" onValueChange={setActiveState} value={activeState}>
            <TabsList className="grid !h-10 w-full max-w-full grid-cols-[repeat(7,minmax(5.75rem,1fr))] justify-start overflow-x-auto rounded-lg bg-muted/60 p-1">
              <TabsTrigger className="h-8 min-w-0 text-xs" value="default">
                Default
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="create">
                Create
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="edit">
                Edit
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="empty">
                Empty
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="error">
                Error
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="loading">
                Loading
              </TabsTrigger>
              <TabsTrigger className="h-8 min-w-0 text-xs" value="archive">
                Archive
              </TabsTrigger>
            </TabsList>

            <div className="min-w-0">{statePreview}</div>
          </Tabs>
        </div>
      </main>
    </TooltipProvider>
  )
}
