'use client'

import { type ComponentType } from 'react'
import { useNavigate } from 'react-router'
import {
  IconBell,
  IconCode,
  IconCreditCard,
  IconFileText,
  IconFolderOpen,
  IconPalette,
  IconRobot,
  IconSettings2,
  IconTerminal2,
  IconWorld,
} from '@tabler/icons-react'

import { useAppTheme } from '@/components/theme/AppThemeProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkbenchCompactRail } from '@/components/workbench/WorkbenchCompactRail'
import { cn } from '@/lib/cn'

type SettingsIcon = ComponentType<{
  size?: number | string
  stroke?: number
  className?: string
}>

type SettingsSection = {
  description: string
  icon: SettingsIcon
  id: string
  label: string
  status?: 'active' | 'planned'
}

const settingsSections = [
  {
    id: 'agent',
    label: 'Agent',
    description: 'Defaults for agent identity, manifest-backed configuration, and memory scope.',
    icon: IconRobot,
    status: 'planned',
  },
  {
    id: 'models',
    label: 'Models',
    description: 'Cloud model profiles, API-key backed providers, and low-cost defaults.',
    icon: IconCode,
    status: 'planned',
  },
  {
    id: 'runtime',
    label: 'Runtime',
    description: 'Repository launch modes, local-folder access, and typed HTTP bridges.',
    icon: IconTerminal2,
    status: 'planned',
  },
  {
    id: 'mcp',
    label: 'MCP and tools',
    description: 'Tool servers, permissions, and external capability connections.',
    icon: IconWorld,
    status: 'planned',
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'GitHub, local repository, and workspace provider connections.',
    icon: IconFolderOpen,
    status: 'planned',
  },
  {
    id: 'secrets',
    label: 'Secrets',
    description: 'API keys, runtime environment values, and provider credentials.',
    icon: IconFileText,
    status: 'planned',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and shell presentation preferences.',
    icon: IconPalette,
    status: 'active',
  },
  {
    id: 'account',
    label: 'Account',
    description: 'User profile, billing, notifications, and workspace access.',
    icon: IconCreditCard,
    status: 'planned',
  },
] satisfies SettingsSection[]

type SettingsSectionId = (typeof settingsSections)[number]['id']

const settingsGroups: Array<{
  label: string
  sectionIds: SettingsSectionId[]
}> = [
  {
    label: 'Workspace',
    sectionIds: ['agent', 'models', 'runtime', 'mcp'],
  },
  {
    label: 'Connections',
    sectionIds: ['integrations', 'secrets'],
  },
  {
    label: 'User',
    sectionIds: ['appearance', 'account'],
  },
]

const sectionById = new Map(settingsSections.map((section) => [section.id, section]))

function StatusBadge({ status }: { status?: SettingsSection['status'] }) {
  if (!status) return null

  return (
    <Badge
      className={cn(
        'ml-auto rounded-[5px] px-1.5 py-0 text-[10px] font-medium',
        status === 'active'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-border/50 bg-muted/50 text-muted-foreground'
      )}
      variant="outline"
    >
      {status === 'active' ? 'Active' : 'Planned'}
    </Badge>
  )
}

function SettingsNavigation() {
  return (
    <aside className="flex shrink-0 flex-col bg-muted/20 px-3 py-4 md:w-[270px] md:px-4 md:py-5">
      <div className="mb-4 flex items-center gap-2 px-1">
        <span className="flex size-7 items-center justify-center rounded-[6px] bg-card text-foreground shadow-sm ring-1 ring-border/40">
          <IconSettings2 className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold">Settings</h1>
          <p className="truncate text-xs text-muted-foreground">Workspace controls</p>
        </div>
      </div>

      <TabsList
        aria-label="Settings sections"
        className="h-auto w-full flex-col items-stretch justify-start gap-4 bg-transparent p-0"
        variant="line"
      >
        {settingsGroups.map((group) => (
          <div className="flex flex-col gap-1" key={group.label}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </div>
            {group.sectionIds.map((sectionId) => {
              const section = sectionById.get(sectionId)
              if (!section) return null

              const SectionIcon = section.icon

              return (
                <TabsTrigger
                  className="h-auto min-h-9 justify-start rounded-[6px] px-2 py-2 text-left text-xs after:hidden data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-border/35 active:scale-[0.99]"
                  key={section.id}
                  value={section.id}
                >
                  <SectionIcon className="size-4 text-muted-foreground" />
                  <span className="truncate">{section.label}</span>
                  <StatusBadge status={section.status} />
                </TabsTrigger>
              )
            })}
          </div>
        ))}
      </TabsList>
    </aside>
  )
}

function SettingsHeader({ section }: { section: SettingsSection }) {
  const SectionIcon = section.icon

  return (
    <header className="flex min-h-14 shrink-0 items-center gap-3 bg-background px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-card shadow-sm ring-1 ring-border/35">
        <SectionIcon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{section.label}</h2>
        <p className="truncate text-xs text-muted-foreground">{section.description}</p>
      </div>
    </header>
  )
}

function SettingsPanel({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode
  eyebrow?: string
  title: string
}) {
  return (
    <section className="rounded-[8px] bg-card/80 shadow-sm ring-1 ring-border/35">
      <div className="px-5 py-4">
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <Separator className="bg-border/45" />
      <div className="divide-y divide-border/45">{children}</div>
    </section>
  )
}

function SettingsRow({
  children,
  description,
  label,
}: {
  children: React.ReactNode
  description?: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <p className="mt-1 max-w-[560px] text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function PlaceholderControl({
  actionLabel = 'Not wired yet',
  description,
  label,
}: {
  actionLabel?: string
  description: string
  label: string
}) {
  return (
    <SettingsRow description={description} label={label}>
      <Button disabled size="sm" type="button" variant="secondary">
        {actionLabel}
      </Button>
    </SettingsRow>
  )
}

function AppearanceSettings() {
  const {
    error: themeError,
    isLoading: themesLoading,
    isSaving: themeSaving,
    selectedTheme,
    setTheme,
    themes,
  } = useAppTheme()
  const selectedThemeIsAvailable = themes.some((theme) => theme.id === selectedTheme)

  return (
    <div className="grid gap-5">
      <SettingsPanel eyebrow="Application" title="Appearance">
        <SettingsRow
          description="Applies the selected token palette across the workbench shell and start surfaces."
          label="Theme"
        >
          <Select
            disabled={themesLoading || themeSaving || themes.length === 0}
            onValueChange={setTheme}
            value={selectedThemeIsAvailable ? selectedTheme : undefined}
          >
            <SelectTrigger aria-label="Theme" className="w-full min-w-[220px] sm:w-[260px]">
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
        </SettingsRow>
        <SettingsRow
          description="Keep non-essential shell transitions subtle for dense work sessions."
          label="Reduced motion"
        >
          <Switch aria-label="Reduced motion" checked={false} disabled />
        </SettingsRow>
      </SettingsPanel>

      {themeError ? (
        <div className="rounded-[8px] bg-destructive/10 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/25">
          Theme settings unavailable.
        </div>
      ) : null}
    </div>
  )
}

function AgentSettings() {
  return (
    <SettingsPanel eyebrow="Agent configuration" title="Agent">
      <PlaceholderControl
        description="Choose the default agent profile used when starting from scratch."
        label="Default agent"
      />
      <PlaceholderControl
        description="Persist cloud agent configuration through a versioned JSON manifest."
        label="Agent manifest"
      />
      <PlaceholderControl
        description="Bind an agent to cloud memory or a local SQLite-backed runtime store."
        label="Memory scope"
      />
    </SettingsPanel>
  )
}

function ModelSettings() {
  return (
    <SettingsPanel eyebrow="Model access" title="Models">
      <PlaceholderControl
        description="Select the low-cost model profile used for cloud conversations."
        label="Default cloud model"
      />
      <PlaceholderControl
        description="Attach user-provided provider credentials without storing plaintext in source files."
        label="Bring your own key"
      />
      <PlaceholderControl
        description="Store named model profiles for agent and workspace defaults."
        label="Provider profiles"
      />
    </SettingsPanel>
  )
}

function RuntimeSettings() {
  return (
    <SettingsPanel eyebrow="Runtime connections" title="Runtime">
      <PlaceholderControl
        description="Open a remote GitHub repository and launch a cloud-backed workbench session."
        label="Open repository"
      />
      <PlaceholderControl
        description="Connect a local folder to a cloud model without moving the workspace into the cloud."
        label="Open local repository"
      />
      <PlaceholderControl
        description="Provision a typed HTTP bridge for local environment access and per-agent persistence."
        label="Typed HTTP bridge"
      />
    </SettingsPanel>
  )
}

function McpSettings() {
  return (
    <SettingsPanel eyebrow="Tooling" title="MCP and tools">
      <PlaceholderControl
        description="Register MCP servers for tools, resources, prompts, and local runtime bridges."
        label="MCP servers"
      />
      <PlaceholderControl
        description="Control whether tools require confirmation, run read-only, or can mutate workspace state."
        label="Tool approvals"
      />
    </SettingsPanel>
  )
}

function IntegrationsSettings() {
  return (
    <SettingsPanel eyebrow="Providers" title="Integrations">
      <PlaceholderControl
        description="Connect GitHub providers for repository search, branch lookup, and launch."
        label="GitHub"
      />
      <PlaceholderControl
        description="Register local folder access for desktop-style repository work."
        label="Local folders"
      />
    </SettingsPanel>
  )
}

function SecretsSettings() {
  return (
    <SettingsPanel eyebrow="Credentials" title="Secrets">
      <PlaceholderControl
        description="Store API keys through the backend secrets surface rather than plaintext files."
        label="API keys"
      />
      <PlaceholderControl
        description="Attach runtime environment values for tools and agent profiles."
        label="Environment values"
      />
    </SettingsPanel>
  )
}

function AccountSettings() {
  return (
    <SettingsPanel eyebrow="User" title="Account">
      <SettingsRow
        description="Account details will use the same dedicated settings route rather than modal overflow."
        label="Profile"
      >
        <Button disabled size="sm" type="button" variant="secondary">
          Not wired yet
        </Button>
      </SettingsRow>
      <SettingsRow
        description="Billing controls belong on this page once subscription state is connected."
        label="Billing"
      >
        <IconCreditCard className="size-4 text-muted-foreground" />
      </SettingsRow>
      <SettingsRow
        description="Notification defaults move here with account preferences."
        label="Notifications"
      >
        <IconBell className="size-4 text-muted-foreground" />
      </SettingsRow>
    </SettingsPanel>
  )
}

function SettingsContent({ sectionId }: { sectionId: SettingsSectionId }) {
  switch (sectionId) {
    case 'agent':
      return <AgentSettings />
    case 'models':
      return <ModelSettings />
    case 'runtime':
      return <RuntimeSettings />
    case 'mcp':
      return <McpSettings />
    case 'integrations':
      return <IntegrationsSettings />
    case 'secrets':
      return <SecretsSettings />
    case 'account':
      return <AccountSettings />
    case 'appearance':
    default:
      return <AppearanceSettings />
  }
}

export default function SettingsPage() {
  const navigate = useNavigate()

  return (
    <main className="flex min-h-screen overflow-hidden bg-background text-foreground">
      <WorkbenchCompactRail
        account={{
          initials: 'J',
          label: 'Jon',
          secondaryLabel: 'kai-chattr workspace',
          status: 'online',
        }}
        activeItem="settings"
        defaultExpanded={false}
        onAccount={() => navigate('/settings')}
        onBilling={() => navigate('/settings')}
        onBrand={() => navigate('/home')}
        onNewSession={() => navigate('/workbench')}
        onNotifications={() => navigate('/settings')}
        onOpenSettings={() => navigate('/settings')}
        onShowConversations={() => navigate('/home')}
      />

      <Tabs
        className="min-w-0 flex-1 gap-0 overflow-hidden bg-background"
        defaultValue="appearance"
        orientation="vertical"
      >
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
          <SettingsNavigation />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
            {settingsSections.map((section) => (
              <TabsContent
                className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                key={section.id}
                value={section.id}
              >
                <SettingsHeader section={section} />
                <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
                  <div className="grid w-full max-w-[900px] gap-5 px-5 py-6">
                    <SettingsContent sectionId={section.id} />
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </div>
        </section>
      </Tabs>
    </main>
  )
}
