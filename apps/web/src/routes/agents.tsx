import { IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import {
  AgentEntityTile,
  EngineChip,
  HomeBadge,
  LifecycleBadge,
  PrototypeBadge,
  StatusDot,
} from '@/components/agents/agent-bits'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { APP_ROUTES } from '@/lib/app-routes'
import { AGENT_FIXTURES, engineById } from '@/lib/agent-fixtures'
import { type AgentLifecycleState } from '@/lib/agent-system-contract'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'

type RosterFilter = 'all' | AgentLifecycleState

const FILTERS: { id: RosterFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'draft', label: 'Draft' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'archived', label: 'Archived' },
]

export default function AgentsRosterPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<RosterFilter>('all')

  const agents = useMemo(
    () =>
      AGENT_FIXTURES.filter(
        (agent) => filter === 'all' || agent.identity.lifecycle_state === filter
      ),
    [filter]
  )

  return (
    <AppShell rail={<KaiAppRail activeItem="agents" />}>
      <Sheet className="min-h-0 min-w-0 flex-1">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-[120px]">
              <h1 className="truncate" style={typographyStyle('ui.body-strong')}>My Agents</h1>
              <p className="hidden truncate text-muted-foreground xl:block" style={typographyStyle('ui.caption')}>
                Durable identities with swappable engines. Workspace-scoped.
              </p>
            </div>
            <span className="hidden lg:inline-flex">
              <PrototypeBadge />
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Tabs onValueChange={(value) => setFilter(value as RosterFilter)} value={filter}>
              <TabsList className="h-8">
                {FILTERS.map((entry) => (
                  <TabsTrigger className="px-2.5" key={entry.id} style={typographyStyle('ui.caption')} value={entry.id}>
                    {entry.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button
              className="h-8 gap-1.5 rounded-[5px]"
              style={typographyStyle('ui.label')}
              onClick={() => navigate(APP_ROUTES.agentsNew)}
              type="button"
            >
              <IconPlus className="size-3.5" />
              Define agent
            </Button>
          </div>
        </header>

        <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
          <div className="mx-auto grid w-full max-w-[1100px] gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => {
              const engine = engineById(agent.model_policy.primary_engine_id)
              const runtimeLabel =
                agent.runtime.home === 'local'
                  ? agent.runtime.local?.slot_label ?? 'Local slot'
                  : agent.runtime.cloud?.namespace_key ?? 'Cloud namespace'

              return (
                <button
                  className={cn(
                    'group flex flex-col gap-3 rounded-[10px] border border-border bg-card/80 p-4 text-left transition-colors',
                    'hover:bg-accent/40 active:scale-[0.995]'
                  )}
                  key={agent.identity.agent_public_id}
                  onClick={() => navigate(`${APP_ROUTES.agents}/${agent.identity.agent_public_id}`)}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <AgentEntityTile
                      accentColor={agent.identity.accent_color}
                      icon={agent.identity.icon}
                      name={agent.identity.name}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate" style={typographyStyle('ui.body-strong')}>
                          {agent.identity.name}
                        </span>
                        <StatusDot status={agent.identity.status} />
                      </div>
                      <p className="truncate text-muted-foreground" style={typographyStyle('ui.caption')}>
                        {agent.identity.role}
                      </p>
                      <p className="mt-0.5 truncate text-muted-foreground/70" style={typographyStyle('code.stat')}>
                        {agent.identity.agent_public_id}
                      </p>
                    </div>
                    <LifecycleBadge state={agent.identity.lifecycle_state} />
                  </div>

                  <p className="line-clamp-2 text-muted-foreground" style={typographyStyle('ui.caption')}>
                    {agent.identity.description}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5">
                    <EngineChip engine={engine} />
                    <HomeBadge home={agent.identity.home} />
                    <span className="ml-auto text-muted-foreground/70" style={typographyStyle('ui.micro')}>
                      {runtimeLabel} · v{agent.version_number}
                    </span>
                  </div>
                </button>
              )
            })}

            <button
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-border bg-card/30 text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground active:scale-[0.995]"
              onClick={() => navigate(APP_ROUTES.agentsNew)}
              type="button"
            >
              <IconPlus className="size-5" />
              <span style={typographyStyle('ui.label')}>Define agent</span>
              <span className="text-muted-foreground/70" style={typographyStyle('ui.micro')}>Next free: Slot 4 of 20</span>
            </button>
          </div>

          <div className="mx-auto w-full max-w-[1100px] px-6 pb-6">
            <p className="text-muted-foreground/60" style={typographyStyle('ui.micro')}>
              Identity is durable; the engine is a swappable attribute. Slots and namespaces are
              materializations — ports never appear here. Fixture-backed until the agents registry
              (Plan 1b) lands; shapes follow docs/schema/final-schema-v4.json.
            </p>
          </div>
        </ScrollArea>
      </Sheet>
    </AppShell>
  )
}
