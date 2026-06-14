import {
  IconActivityHeartbeat,
  IconArrowLeft,
  IconBrain,
  IconDatabase,
  IconFingerprint,
  IconGitBranch,
  IconLayoutDashboard,
  IconRefresh,
  IconServerCog,
  IconShieldLock,
  IconTerminal2,
  IconTool,
  IconWebhook,
} from '@tabler/icons-react'
import { type ComponentType, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import {
  AgentEntityTile,
  EngineChip,
  HomeBadge,
  KeyValueRow,
  LifecycleBadge,
  MicroHeader,
  PrototypeBadge,
  RailSectionBar,
  StatusDot,
} from '@/components/agents/agent-bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { APP_ROUTES } from '@/lib/app-routes'
import { typographyStyle } from '@/lib/design-system'
import { agentByPublicId, engineById } from '@/lib/agent-fixtures'
import {
  AGENT_CONSOLE_TABS,
  type AgentConsoleTab,
  type AgentDetail,
} from '@/lib/agent-system-contract'

const TAB_LABELS: Record<AgentConsoleTab, string> = {
  overview: 'Overview',
  identity: 'Identity',
  runtime: 'Runtime',
  model: 'Model',
  capabilities: 'Capabilities',
  invocations: 'Invocations',
  memory: 'Memory & Library',
  access: 'Access & Trust',
  versions: 'Versions',
  activity: 'Activity',
}

const TAB_META: Record<
  AgentConsoleTab,
  {
    accent: string
    icon: ComponentType<{ className?: string }>
    label: string
  }
> = {
  overview: { accent: '#6ee7b7', icon: IconLayoutDashboard, label: 'Overview' },
  identity: { accent: '#f9a8d4', icon: IconFingerprint, label: 'Identity' },
  runtime: { accent: '#93c5fd', icon: IconServerCog, label: 'Runtime' },
  model: { accent: '#c4b5fd', icon: IconBrain, label: 'Model' },
  capabilities: { accent: '#fcd34d', icon: IconTool, label: 'Capabilities' },
  invocations: { accent: '#67e8f9', icon: IconWebhook, label: 'Invocations' },
  memory: { accent: '#86efac', icon: IconDatabase, label: 'Memory' },
  access: { accent: '#fda4af', icon: IconShieldLock, label: 'Access' },
  versions: { accent: '#fdba74', icon: IconGitBranch, label: 'Versions' },
  activity: { accent: '#a5b4fc', icon: IconActivityHeartbeat, label: 'Activity' },
}

const STUB_TABS: Partial<Record<AgentConsoleTab, string>> = {
  capabilities: 'Tool, skill, and MCP bindings land with Slice 5 (capability catalogs).',
  invocations: 'Thread invocation lands with Slice 4; schedule/webhook/email follow staged enablement.',
  memory: 'Memory records, suggestions queue, and context library land with Slice 6.',
  access: 'Administrative access editing lands with Plan 1.5 (auth/membership).',
}

function SectionCard({
  children,
  title,
}: {
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="px-5 py-3">
        <MicroHeader>{title}</MicroHeader>
      </div>
      <Separator className="bg-border" />
      {children}
    </section>
  )
}

function OverviewTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Runtime state', value: agent.runtime.state },
          { label: 'Execution mode', value: agent.execution_policy.mode.replace('_', ' ') },
          {
            label: 'Budget / run',
            value: `$${agent.execution_policy.budget_limit_per_run_usd.toFixed(2)}`,
          },
        ].map((metric) => (
          <div className="rounded-[10px] border border-border bg-card px-4 py-3" key={metric.label}>
            <MicroHeader>{metric.label}</MicroHeader>
            <p className="mt-1 capitalize" style={typographyStyle('ui.lg')}>{metric.value}</p>
          </div>
        ))}
      </div>

      <SectionCard title="Recent activity">
        <div className="divide-y divide-border">
          {agent.activity.map((event) => (
            <div className="flex items-baseline gap-3 px-5 py-2.5" key={event.id}>
              <span className="shrink-0 text-muted-foreground/70" style={typographyStyle('code.stat')}>
                {new Date(event.at).toLocaleString()}
              </span>
              <p className="min-w-0" style={typographyStyle('ui.caption')}>
                <span className="font-medium">{event.actor}</span>{' '}
                <span className="text-muted-foreground">{event.summary}</span>
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Version history">
        <div className="divide-y divide-border">
          {agent.versions.map((version) => (
            <div className="flex items-center gap-3 px-5 py-2.5" key={version.version_id}>
              <Badge className="rounded-[5px]" style={typographyStyle('code.stat')} variant="outline">
                v{version.version_number}
              </Badge>
              <p className="min-w-0 flex-1 truncate" style={typographyStyle('ui.caption')}>{version.change_summary}</p>
              <span className="shrink-0 text-muted-foreground/70" style={typographyStyle('ui.micro')}>
                {version.created_by} · {new Date(version.created_at).toLocaleDateString()}
              </span>
              <Badge className="rounded-[5px] capitalize" style={typographyStyle('ui.micro')} variant={version.state === 'published' ? 'secondary' : 'outline'}>
                {version.state}
              </Badge>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function IdentityTab({ agent }: { agent: AgentDetail }) {
  return (
    <div className="grid gap-4">
      <SectionCard title="Identity">
        <div className="divide-y divide-border">
          <KeyValueRow label="Name" value={agent.identity.name} />
          <KeyValueRow label="Role" value={agent.identity.role} />
          <KeyValueRow
            label="Public id"
            value={<span className="font-mono">{agent.identity.agent_public_id}</span>}
          />
          <KeyValueRow label="Workspace" value={agent.identity.workspace_public_id} />
        </div>
      </SectionCard>
      <SectionCard title="Persona — renders into soul.md">
        <p className="px-5 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>
          {agent.identity.persona}
        </p>
      </SectionCard>
      <SectionCard title="Description">
        <p className="px-5 py-4 text-muted-foreground" style={typographyStyle('ui.caption')}>
          {agent.identity.description}
        </p>
      </SectionCard>
    </div>
  )
}

function ModelTab({ agent }: { agent: AgentDetail }) {
  const engine = engineById(agent.model_policy.primary_engine_id)
  const subagentEngine = agent.model_policy.subagent_engine_id
    ? engineById(agent.model_policy.subagent_engine_id)
    : undefined

  return (
    <div className="grid gap-4">
      <SectionCard title="Engine">
        <div className="divide-y divide-border">
          <KeyValueRow label="Primary engine" value={<EngineChip engine={engine} />} />
          <KeyValueRow label="Pinning" value={agent.model_policy.engine_pinning.replace(/_/g, ' ')} />
          <KeyValueRow
            label="Subagent engine"
            value={subagentEngine ? <EngineChip engine={subagentEngine} /> : '—'}
          />
          <KeyValueRow
            label="Context window"
            value={engine ? `${(engine.context_window / 1000).toLocaleString()}k tokens` : '—'}
          />
          <KeyValueRow
            label="Swap note"
            value="Identity and memory persist; only the launch profile changes."
          />
        </div>
      </SectionCard>
      <SectionCard title="Inference">
        <div className="divide-y divide-border">
          <KeyValueRow label="Reasoning mode" value={agent.model_policy.reasoning_mode ?? '—'} />
          <KeyValueRow label="Reasoning effort" value={agent.model_policy.reasoning_effort ?? '—'} />
          <KeyValueRow label="Fast mode" value={agent.model_policy.fast_mode_enabled ? 'Enabled' : 'Off'} />
          <KeyValueRow label="Structured output" value="Required (always)" />
        </div>
      </SectionCard>
      <SectionCard title="Execution policy">
        <div className="divide-y divide-border">
          <KeyValueRow label="Mode" value={agent.execution_policy.mode.replace('_', ' ')} />
          <KeyValueRow
            label="Turn timeout"
            value={`${agent.execution_policy.max_turn_duration_seconds / 60} min`}
          />
          <KeyValueRow label="Max steps / run" value={agent.execution_policy.max_steps_per_run} />
          <KeyValueRow
            label="Budget / run"
            value={`$${agent.execution_policy.budget_limit_per_run_usd.toFixed(2)}`}
          />
          <KeyValueRow
            label="Budget / day"
            value={
              agent.execution_policy.budget_limit_per_day_usd
                ? `$${agent.execution_policy.budget_limit_per_day_usd.toFixed(2)}`
                : '—'
            }
          />
        </div>
      </SectionCard>
    </div>
  )
}

function RuntimeTab({ agent }: { agent: AgentDetail }) {
  const { runtime } = agent

  return (
    <div className="grid gap-4">
      <SectionCard title={runtime.home === 'local' ? 'Local slot (diagnostics)' : 'Cloud namespace'}>
        <div className="divide-y divide-border">
          <KeyValueRow label="State" value={<span className="capitalize">{runtime.state}</span>} />
          {runtime.local ? (
            <>
              <KeyValueRow label="Slot" value={runtime.local.slot_label} />
              <KeyValueRow label="Bridge" value={runtime.local.local_bridge_id} />
              <KeyValueRow label="Pairing" value={runtime.local.pairing_state} />
              <KeyValueRow label="Heartbeat" value={runtime.local.heartbeat_status} />
              <KeyValueRow
                label="Home"
                value={<span className="font-mono">{runtime.local.local_home_ref}</span>}
              />
              <KeyValueRow
                label="Mount"
                value={
                  <span className="font-mono">
                    slots/{runtime.local.slot_id}/current
                  </span>
                }
              />
              <KeyValueRow label="Port (internal)" value={runtime.local.port_internal} />
              <KeyValueRow label="Process" value={runtime.local.process_status} />
            </>
          ) : null}
          {runtime.cloud ? (
            <>
              <KeyValueRow
                label="Namespace"
                value={<span className="font-mono">{runtime.cloud.namespace_key}</span>}
              />
              <KeyValueRow label="Hosted runtime" value={runtime.cloud.hosted_runtime_id} />
              <KeyValueRow label="Process" value={runtime.cloud.process_status} />
            </>
          ) : null}
        </div>
      </SectionCard>

      {runtime.local ? (
        <SectionCard title="Terminal — wterm">
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="text-muted-foreground" style={typographyStyle('ui.caption')}>
              Per-slot PTY owned by the backend; terminal stays on to keep the CLI runtime on.
              Session lands with Slice 3 (local runtime).
            </p>
            <Button className="h-8 gap-1.5 rounded-[5px]" disabled style={typographyStyle('ui.label')} type="button" variant="outline">
              <IconTerminal2 className="size-3.5" />
              Open terminal
            </Button>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Slot actions">
        <div className="flex items-center gap-2 px-5 py-4">
          {['Relaunch', 'Repair pairing', 'Free slot'].map((action) => (
            <Button
              className="h-8 rounded-[5px]"
              disabled
              key={action}
              style={typographyStyle('ui.label')}
              type="button"
              variant="outline"
            >
              {action}
            </Button>
          ))}
          <span className="ml-1 text-muted-foreground/70" style={typographyStyle('ui.micro')}>Slice 3</span>
          <Button className="h-8 rounded-[5px]" disabled style={typographyStyle('ui.label')} type="button" variant="outline">
            Migrate home
          </Button>
          <span className="text-muted-foreground/70" style={typographyStyle('ui.micro')}>v1.5 · reserved</span>
        </div>
      </SectionCard>
    </div>
  )
}

function StubTab({ note }: { note: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-[10px] border border-dashed border-border bg-card/30">
      <p className="max-w-[44ch] px-6 text-center text-muted-foreground" style={typographyStyle('ui.caption')}>
        {note}
      </p>
    </div>
  )
}

function AgentConsoleTabs() {
  return (
    <div className="border-b border-border bg-background/70 px-5 py-2.5">
      <TabsList
        aria-label="Agent console sections"
        className="!h-auto w-full justify-start gap-1 overflow-x-auto rounded-[10px] bg-muted/45 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [scrollbar-width:none] lg:grid lg:grid-cols-10 [&::-webkit-scrollbar]:hidden"
      >
        {AGENT_CONSOLE_TABS.map((tabId) => {
          const meta = TAB_META[tabId]
          const Icon = meta.icon

          return (
            <TabsTrigger
              aria-label={TAB_LABELS[tabId]}
              className="group/agent-tab !h-[54px] min-w-[98px] flex-none flex-col gap-1 rounded-[8px] px-1.5 text-muted-foreground transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out after:hidden active:scale-[0.98] data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.13),inset_0_-2px_0_var(--agent-tab-accent)] dark:data-[state=active]:bg-white/[0.055] lg:min-w-0"
              key={tabId}
              style={{ '--agent-tab-accent': meta.accent, ...typographyStyle('ui.micro') } as React.CSSProperties}
              value={tabId}
            >
              <Icon className="size-4 text-muted-foreground/75 transition-[color,transform] duration-150 group-data-[state=active]/agent-tab:text-foreground" />
              <span className="whitespace-nowrap">{meta.label}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </div>
  )
}

export default function AgentDetailPage() {
  const navigate = useNavigate()
  const { agentPublicId } = useParams()
  const [tab, setTab] = useState<AgentConsoleTab>('overview')
  const agent = agentPublicId ? agentByPublicId(agentPublicId) : undefined

  if (!agent) {
    return (
      <AppShell rail={<KaiAppRail activeItem="agents" />}>
        <Sheet className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
          <div className="text-center">
            <p style={typographyStyle('ui.body-strong')}>Agent not found</p>
            <p className="mt-1 text-muted-foreground" style={typographyStyle('ui.caption')}>
              No fixture agent with id “{agentPublicId}”.
            </p>
            <Button
              className="mt-4 h-8 rounded-[5px]"
              style={typographyStyle('ui.label')}
              onClick={() => navigate(APP_ROUTES.agents)}
              type="button"
              variant="outline"
            >
              Back to roster
            </Button>
          </div>
        </Sheet>
      </AppShell>
    )
  }

  const engine = engineById(agent.model_policy.primary_engine_id)

  return (
    <AppShell rail={<KaiAppRail activeItem="agents" />}>
      <div className="flex min-h-0 min-w-0 flex-1 gap-[5px]">
        <Sheet className="min-h-0 min-w-0 flex-1">
          <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3">
            <Button
              aria-label="Back to roster"
              className="size-8 rounded-[5px]"
              onClick={() => navigate(APP_ROUTES.agents)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <IconArrowLeft className="size-4" />
            </Button>
            <AgentEntityTile
              accentColor={agent.identity.accent_color}
              icon={agent.identity.icon}
              name={agent.identity.name}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate" style={typographyStyle('ui.lg')}>
                  {agent.identity.name}
                </h1>
                <StatusDot status={agent.identity.status} />
                <LifecycleBadge state={agent.identity.lifecycle_state} />
              </div>
              <p className="truncate text-muted-foreground" style={typographyStyle('ui.caption')}>
                {agent.identity.role} ·{' '}
                <span style={typographyStyle('code.stat')}>{agent.identity.agent_public_id}</span>
              </p>
            </div>
            <PrototypeBadge />
            <Button className="h-8 gap-1.5 rounded-[5px]" disabled style={typographyStyle('ui.label')} type="button" variant="outline">
              <IconRefresh className="size-3.5" />
              Swap engine
            </Button>
          </header>

          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            onValueChange={(value) => setTab(value as AgentConsoleTab)}
            value={tab}
          >
            <AgentConsoleTabs />

            <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
              <div className="mx-auto w-full max-w-[860px] px-5 py-5">
                <TabsContent className="m-0" value="overview">
                  <OverviewTab agent={agent} />
                </TabsContent>
                <TabsContent className="m-0" value="identity">
                  <IdentityTab agent={agent} />
                </TabsContent>
                <TabsContent className="m-0" value="model">
                  <ModelTab agent={agent} />
                </TabsContent>
                <TabsContent className="m-0" value="runtime">
                  <RuntimeTab agent={agent} />
                </TabsContent>
                <TabsContent className="m-0" value="versions">
                  <OverviewTab agent={agent} />
                </TabsContent>
                <TabsContent className="m-0" value="activity">
                  <OverviewTab agent={agent} />
                </TabsContent>
                {Object.entries(STUB_TABS).map(([tabId, note]) => (
                  <TabsContent className="m-0" key={tabId} value={tabId}>
                    <StubTab note={note} />
                  </TabsContent>
                ))}
              </div>
            </ScrollArea>
          </Tabs>
        </Sheet>

        <Sheet className="hidden w-[290px] shrink-0 lg:flex lg:min-h-0 lg:flex-col">
          <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
            <RailSectionBar>Access</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Visibility" value="Private to you" />
              <KeyValueRow label="Trust profile" value={<span className="capitalize">{agent.trust_profile}</span>} />
              <KeyValueRow label="Owner" value="Jon" />
            </div>
            <RailSectionBar>Runtime</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Home" value={<HomeBadge home={agent.identity.home} />} />
              <KeyValueRow
                label={agent.runtime.home === 'local' ? 'Slot' : 'Namespace'}
                value={
                  agent.runtime.local?.slot_label ?? (
                    <span className="font-mono">{agent.runtime.cloud?.namespace_key}</span>
                  )
                }
              />
              <KeyValueRow label="Engine" value={<EngineChip engine={engine} />} />
            </div>
            <RailSectionBar>Invocations</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Thread" value="Enabled" />
              <KeyValueRow label="Schedule" value="—" />
              <KeyValueRow label="Webhook" value="Disabled (default)" />
            </div>
            <RailSectionBar>Capabilities</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Tools" value={agent.counters.tools} />
              <KeyValueRow label="Skills" value={agent.counters.skills} />
              <KeyValueRow label="Integrations" value={agent.counters.integrations} />
            </div>
            <RailSectionBar>Memory</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Profile" value={<span className="capitalize">{agent.memory_policy.profile.replace('_', ' ')}</span>} />
              <KeyValueRow label="Records" value={agent.counters.memories} />
              <KeyValueRow label="Library" value={agent.counters.library_items} />
              <KeyValueRow label="Writes" value={agent.memory_policy.write_scope.replace('_', ' ')} />
            </div>
          </ScrollArea>
        </Sheet>
      </div>
    </AppShell>
  )
}
