import { type ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import {
  type AgentLifecycleState,
  type AgentStatus,
  type EngineDefinition,
} from '@/lib/agent-system-contract'
import { ENGINE_FAMILY_COLORS } from '@/lib/agent-fixtures'

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground',
}

const LIFECYCLE_LABELS: Record<AgentLifecycleState, string> = {
  draft: 'Draft',
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
  deleted: 'Deleted',
}

export function StatusDot({ status }: { status: AgentStatus }) {
  return (
    <span
      aria-label={status}
      className={cn('inline-block size-2 shrink-0 rounded-full', STATUS_DOT_CLASS[status])}
      role="img"
      title={status}
    />
  )
}

export function LifecycleBadge({ state }: { state: AgentLifecycleState }) {
  return (
    <Badge
      className={cn(
        'rounded-[5px] text-[10px]',
        state === 'suspended' ? 'border-amber-500/40 text-amber-500' : null,
        state === 'archived' || state === 'deleted' ? 'opacity-60' : null
      )}
      variant={state === 'active' ? 'secondary' : 'outline'}
    >
      {LIFECYCLE_LABELS[state]}
    </Badge>
  )
}

export function AgentEntityTile({
  accentColor,
  icon,
  name,
  size = 'sm',
}: {
  accentColor: string
  icon: string
  name: string
  size?: 'sm' | 'lg'
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center text-foreground',
        size === 'lg' ? 'size-20 rounded-[22px] text-3xl' : 'size-10 rounded-[12px] text-lg'
      )}
      style={{ backgroundColor: `${accentColor}26`, border: `1px solid ${accentColor}55` }}
      title={name}
    >
      <span>{icon}</span>
    </div>
  )
}

export function EngineChip({ engine }: { engine: EngineDefinition | undefined }) {
  if (!engine) {
    return <Badge variant="outline">No engine</Badge>
  }

  return (
    <Badge className="gap-1.5 rounded-[5px] font-normal" variant="outline">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: ENGINE_FAMILY_COLORS[engine.family] ?? 'currentColor' }}
      />
      {engine.display_name}
    </Badge>
  )
}

export function HomeBadge({ home }: { home: 'local' | 'cloud' }) {
  return (
    <Badge
      className={cn(
        'rounded-[5px] text-[10px] capitalize',
        home === 'local' ? 'border-sky-500/40 text-sky-400' : 'border-violet-500/40 text-violet-400'
      )}
      variant="outline"
    >
      {home}
    </Badge>
  )
}

export function PrototypeBadge() {
  return (
    <Badge className="rounded-[5px] text-[10px]" variant="outline">
      Prototype · fixture data
    </Badge>
  )
}

export function MicroHeader({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </p>
  )
}

/** Properties-panel grammar: muted label left, value right. */
export function KeyValueRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 px-4 py-1.5">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-[11.5px] font-medium">{value}</span>
    </div>
  )
}

export function RailSectionBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  )
}
