import { IconArrowLeft, IconCheck } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import {
  EngineChip,
  KeyValueRow,
  MicroHeader,
  PrototypeBadge,
  RailSectionBar,
} from '@/components/agents/agent-bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { APP_ROUTES } from '@/lib/app-routes'
import { ENGINE_CATALOG, TRUST_PROFILE_SUMMARIES, engineById } from '@/lib/agent-fixtures'
import { type AgentHome, type TrustProfileName } from '@/lib/agent-system-contract'
import { cn } from '@/lib/cn'

const STEPS = ['Intent', 'Identity', 'Home', 'Model & Trust', 'Review'] as const

const INTENTS = [
  { id: 'blank', label: 'Blank agent', note: 'Start from an empty identity.' },
  { id: 'template', label: 'From template', note: 'Curated starting points. Coming with Slice 5.' },
  { id: 'preset', label: 'From role preset', note: 'Designer, PM, reviewer, analyst.' },
  { id: 'duplicate', label: 'Duplicate existing', note: 'Copy an agent from the roster.' },
  { id: 'goal', label: 'Generate from goal', note: 'Describe the job; we draft the identity.' },
  { id: 'import', label: 'Import definition', note: 'Paste an AgentDefinition JSON.' },
] as const

const ROLE_PRESETS = [
  'Front-end designer',
  'Implementer / builder',
  'Reviewer / QA',
  'Project manager',
  'Director',
  'Custom…',
]

const ACCENTS = ['#d97757', '#4e8cf7', '#10a37f', '#b8893b', '#8f5cf7', '#e25563']

function slugify(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function ChoiceCard({
  active,
  label,
  note,
  onClick,
}: {
  active: boolean
  label: string
  note: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex flex-col gap-1 rounded-[10px] border px-4 py-3 text-left transition-colors active:scale-[0.995]',
        active ? 'border-primary/60 bg-primary/5' : 'border-border bg-card/60 hover:bg-accent/40'
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-2 text-[12.5px] font-medium">
        {label}
        {active ? <IconCheck className="size-3.5 text-primary" /> : null}
      </span>
      <span className="text-[11px] leading-4 text-muted-foreground">{note}</span>
    </button>
  )
}

export default function AgentCreatePage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [provisionNotice, setProvisionNotice] = useState(false)

  const [intent, setIntent] = useState<string>('blank')
  const [name, setName] = useState('')
  const [role, setRole] = useState(ROLE_PRESETS[0])
  const [persona, setPersona] = useState('')
  const [description, setDescription] = useState('')
  const [accent, setAccent] = useState(ACCENTS[0])
  const [home, setHome] = useState<AgentHome>('local')
  const [engineId, setEngineId] = useState(ENGINE_CATALOG[0].engine_id)
  const [trust, setTrust] = useState<TrustProfileName>('private')

  const publicId = useMemo(() => (name ? `ag_${slugify(name)}` : 'ag_…'), [name])
  const engine = engineById(engineId)
  const canContinue =
    step === 1 ? name.trim().length > 0 : true

  return (
    <AppShell rail={<KaiAppRail activeItem="agents" />}>
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
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[13px] font-semibold leading-tight">Define agent</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Creation is thin — deeper tuning lives in the agent console after provisioning.
            </p>
          </div>
          <PrototypeBadge />
        </header>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-[190px] shrink-0 border-r border-border px-3 py-4 md:block">
            <ol className="grid gap-1">
              {STEPS.map((label, index) => (
                <li key={label}>
                  <button
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-1.5 text-left text-[12px] transition-colors',
                      index === step
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/40',
                      index > step ? 'opacity-60' : null
                    )}
                    disabled={index > step}
                    onClick={() => setStep(index)}
                    type="button"
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                        index < step
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border'
                      )}
                    >
                      {index < step ? <IconCheck className="size-3" /> : index + 1}
                    </span>
                    {label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <ScrollArea className="min-h-0 min-w-0 flex-1" viewportClassName="min-h-0">
            <div className="mx-auto grid w-full max-w-[640px] gap-5 px-6 py-6">
              {step === 0 ? (
                <>
                  <MicroHeader>What should this agent be?</MicroHeader>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {INTENTS.map((entry) => (
                      <ChoiceCard
                        active={intent === entry.id}
                        key={entry.id}
                        label={entry.label}
                        note={entry.note}
                        onClick={() => setIntent(entry.id)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <MicroHeader>Identity — durable; renders into soul.md</MicroHeader>
                  <div className="grid gap-4">
                    <div className="grid gap-1.5">
                      <Label className="text-[12px]" htmlFor="agent-name">Name</Label>
                      <Input
                        id="agent-name"
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Matt"
                        value={name}
                      />
                      <p className="font-mono text-[10.5px] text-muted-foreground/70">{publicId}</p>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-[12px]">Role</Label>
                      <Select onValueChange={setRole} value={role}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_PRESETS.map((preset) => (
                            <SelectItem key={preset} value={preset}>
                              {preset}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-[12px]" htmlFor="agent-persona">Persona</Label>
                      <Textarea
                        id="agent-persona"
                        onChange={(event) => setPersona(event.target.value)}
                        placeholder="Identity style and operating principles — distinct from the system prompt."
                        rows={4}
                        value={persona}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-[12px]" htmlFor="agent-description">Description</Label>
                      <Input
                        id="agent-description"
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="What this agent owns."
                        value={description}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-[12px]">Accent</Label>
                      <div className="flex gap-2">
                        {ACCENTS.map((swatch) => (
                          <button
                            aria-label={`Accent ${swatch}`}
                            className={cn(
                              'size-7 rounded-full border-2 transition-transform active:scale-95',
                              accent === swatch ? 'border-foreground' : 'border-transparent'
                            )}
                            key={swatch}
                            onClick={() => setAccent(swatch)}
                            style={{ backgroundColor: swatch }}
                            type="button"
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <MicroHeader>Home — where the identity materializes</MicroHeader>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <ChoiceCard
                      active={home === 'local'}
                      label="Local"
                      note="Slot 4 of 20 reserved on your bridge. The cloud stores a pointer only — never local disk contents."
                      onClick={() => setHome('local')}
                    />
                    <ChoiceCard
                      active={home === 'cloud'}
                      label="Cloud"
                      note="Platform-provisioned namespace. Portable record is the source of truth either way."
                      onClick={() => setHome('cloud')}
                    />
                  </div>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <MicroHeader>Engine — swappable; identity and memory persist</MicroHeader>
                  <div className="grid gap-2.5">
                    {ENGINE_CATALOG.filter((entry) => entry.supported_homes.includes(home)).map(
                      (entry) => (
                        <button
                          className={cn(
                            'flex items-center gap-3 rounded-[10px] border px-4 py-2.5 text-left transition-colors active:scale-[0.995]',
                            engineId === entry.engine_id
                              ? 'border-primary/60 bg-primary/5'
                              : 'border-border bg-card/60 hover:bg-accent/40'
                          )}
                          key={entry.engine_id}
                          onClick={() => setEngineId(entry.engine_id)}
                          type="button"
                        >
                          <EngineChip engine={entry} />
                          <span className="ml-auto text-[10.5px] text-muted-foreground/70">
                            {(entry.context_window / 1000).toLocaleString()}k ctx · $
                            {entry.cost_metadata.input_usd_per_mtok}/$
                            {entry.cost_metadata.output_usd_per_mtok} per Mtok
                          </span>
                        </button>
                      )
                    )}
                  </div>
                  <MicroHeader>Trust preset — stamps the policy envelope</MicroHeader>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(Object.keys(TRUST_PROFILE_SUMMARIES) as TrustProfileName[]).map((profile) => (
                      <ChoiceCard
                        active={trust === profile}
                        key={profile}
                        label={profile.charAt(0).toUpperCase() + profile.slice(1)}
                        note={TRUST_PROFILE_SUMMARIES[profile]}
                        onClick={() => setTrust(profile)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <MicroHeader>Review — version 1 of the agent definition</MicroHeader>
                  <section className="overflow-hidden rounded-[10px] border border-border bg-card">
                    <div className="divide-y divide-border">
                      <KeyValueRow label="Name" value={name || '—'} />
                      <KeyValueRow label="Public id" value={<span className="font-mono">{publicId}</span>} />
                      <KeyValueRow label="Role" value={role} />
                      <KeyValueRow label="Home" value={<span className="capitalize">{home}</span>} />
                      <KeyValueRow
                        label={home === 'local' ? 'Slot' : 'Namespace'}
                        value={home === 'local' ? 'Slot 4 of 20' : 'provisioned on create'}
                      />
                      <KeyValueRow label="Engine" value={<EngineChip engine={engine} />} />
                      <KeyValueRow label="Trust preset" value={<span className="capitalize">{trust}</span>} />
                    </div>
                  </section>
                  {provisionNotice ? (
                    <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[11.5px] leading-5 text-amber-600 dark:text-amber-400">
                      Prototype: provisioning becomes available when the agents registry (Plan 1b /
                      Slice 2) lands. This wizard already produces a contract-complete definition —
                      nothing here is thrown away.
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button
                  className="h-8 rounded-[5px] text-[12px]"
                  disabled={step === 0}
                  onClick={() => setStep((current) => Math.max(0, current - 1))}
                  type="button"
                  variant="outline"
                >
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button
                    className="h-8 rounded-[5px] text-[12px]"
                    disabled={!canContinue}
                    onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))}
                    type="button"
                  >
                    Continue
                  </Button>
                ) : (
                  <Button
                    className="h-8 rounded-[5px] text-[12px]"
                    onClick={() => setProvisionNotice(true)}
                    type="button"
                  >
                    Provision agent
                  </Button>
                )}
              </div>
            </div>
          </ScrollArea>

          <aside className="hidden w-[260px] shrink-0 border-l border-border xl:block">
            <RailSectionBar>Provisioned automatically</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="Structured output" value="Pydantic · 100%" />
              <KeyValueRow label="Individual memory" value="per-agent store" />
              <KeyValueRow label="Collective memory" value="pgvector (workspace)" />
            </div>
            <RailSectionBar>{home === 'local' ? 'Local home' : 'Cloud home'}</RailSectionBar>
            <div className="divide-y divide-border">
              {home === 'local' ? (
                <>
                  <KeyValueRow label="Slot" value="Slot 4 of 20" />
                  <KeyValueRow label="Pairing" value="on provision" />
                  <KeyValueRow label="Agent token" value="bridge-minted" />
                </>
              ) : (
                <>
                  <KeyValueRow label="Namespace" value="on provision" />
                  <KeyValueRow label="Agent token" value="platform-minted" />
                </>
              )}
            </div>
            <RailSectionBar>Artifacts</RailSectionBar>
            <div className="divide-y divide-border">
              <KeyValueRow label="soul.md" value="from identity" />
              <KeyValueRow label="heartbeat.md" value="runtime-owned" />
              <KeyValueRow label="memory.db" value="identity-owned" />
            </div>
          </aside>
        </div>
      </Sheet>
    </AppShell>
  )
}
