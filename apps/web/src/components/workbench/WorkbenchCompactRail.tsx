'use client'

import {
  IconActivityHeartbeat,
  IconBell,
  IconChevronDown,
  IconChevronRight,
  IconCreditCard,
  IconFolder,
  IconLibrary,
  IconListCheck,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconMessages,
  IconPlus,
  IconPlugConnected,
  IconRobot,
  IconSearch,
  IconSettings2,
} from '@tabler/icons-react'
import { type ComponentType, type CSSProperties, type ReactNode, useCallback, useState } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'

export type WorkbenchCompactRailItem =
  | 'new-session'
  | 'search'
  | 'library'
  | 'file-stores'
  | 'knowledge-bases'
  | 'integrations'
  | 'observability'
  | 'agents'
  | 'projects'
  | 'conversations'
  | 'tasks'
  | 'settings'

type WorkbenchCompactRailAccount = {
  avatarUrl?: string
  initials: string
  label: string
  secondaryLabel?: string
  status?: 'online' | 'idle' | 'offline'
}

export type WorkbenchCompactRailEntry = {
  accentColor?: string
  id: string
  label: string
  onSelect?: () => void
}

type WorkbenchCompactRailProps = {
  activeItem?: WorkbenchCompactRailItem
  activeAgentId?: string
  activeProjectId?: string
  account?: WorkbenchCompactRailAccount
  /** Active user agents rendered as children under "My Agents". */
  agentEntries?: WorkbenchCompactRailEntry[]
  className?: string
  projectEntries?: WorkbenchCompactRailEntry[]
  /** Recent conversations — rendered as the collapsible children of the "Recent" menu. */
  recentEntries?: WorkbenchCompactRailEntry[]
  /** Suggested tasks — rendered as the collapsible children of the "Tasks" menu. */
  taskEntries?: WorkbenchCompactRailEntry[]
  /** Open (expanded sidebar) by default; collapse toggles to the 60px icon rail. */
  defaultExpanded?: boolean
  /** Brand mark for the reserved top-left slot. Falls back to a lettermark. */
  logo?: ReactNode
  /** Sessions list — rendered under a "Sessions" heading when expanded. Wire your
   *  conversation data here; the rail does not fetch it. */
  sessions?: ReactNode
  utilities?: (state: { expanded: boolean }) => ReactNode
  onAccount?: () => void
  onBilling?: () => void
  onBrand?: () => void
  onCreateAgent?: () => void
  onCreateChat?: () => void
  onCreateLibrary?: () => void
  onCreateProject?: () => void
  onCreateTask?: () => void
  onLogOut?: () => void
  onNewSession?: () => void
  onNotifications?: () => void
  onOpenAgents?: () => void
  onOpenFileStores?: () => void
  onOpenIntegrations?: () => void
  onOpenKnowledgeBases?: () => void
  onOpenLibrary?: () => void
  onOpenObservability?: () => void
  onOpenProjects?: () => void
  onOpenSearch?: () => void
  onOpenSettings?: () => void
  onShowConversations?: () => void
  onShowTasks?: () => void
}

type RailItemProps = {
  active?: boolean
  expanded: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
}

type RailSectionProps = {
  children?: ReactNode
  expanded: boolean
  label?: string
}

type RailPlaceholderSectionProps = {
  active?: boolean
  children?: ReactNode
  defaultOpen?: boolean
  expanded: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onAdd?: () => void
  onClick?: () => void
  showDisclosure?: boolean
}

const statusClassName = {
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground',
  online: 'bg-emerald-400',
} satisfies Record<NonNullable<WorkbenchCompactRailAccount['status']>, string>

const railExpandedStorageKey = 'kai-chattr-workbench-rail-expanded-v1'

function readPersistedRailExpanded(defaultExpanded: boolean) {
  if (typeof window === 'undefined') {
    return defaultExpanded
  }

  try {
    const persisted = window.localStorage.getItem(railExpandedStorageKey)

    if (persisted === 'true') {
      return true
    }

    if (persisted === 'false') {
      return false
    }
  } catch {
    return defaultExpanded
  }

  return defaultExpanded
}

function writePersistedRailExpanded(expanded: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(railExpandedStorageKey, String(expanded))
  } catch {
    // Ignore unavailable storage; the in-memory rail state still updates.
  }
}

function RailItem({ active, expanded, icon: Icon, label, onClick }: RailItemProps) {
  const itemStyle = {
    color: active
      ? 'var(--sidebar-foreground)'
      : 'color-mix(in oklch, var(--sidebar-foreground) 70%, transparent)',
  } satisfies CSSProperties

  const button = (
    <Button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'transition-colors active:scale-95',
        expanded
          ? 'h-8 w-full justify-start gap-2.5 rounded-[5px] px-2'
          : 'size-9 rounded-[5px]',
        active
          ? 'bg-transparent font-semibold hover:bg-transparent'
          : 'hover:bg-sidebar-accent/55'
      )}
      onClick={onClick}
      size={expanded ? 'default' : 'icon'}
      style={expanded ? { ...itemStyle, ...typographyStyle('ui.body-strong') } : itemStyle}
      type="button"
      variant="ghost"
    >
      <Icon className={expanded ? 'size-3.5 shrink-0' : 'size-[18px]'} />
      {expanded ? <span className="truncate">{label}</span> : null}
    </Button>
  )

  if (expanded) {
    return button
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function RailSection({ children, expanded, label }: RailSectionProps) {
  if (!children) {
    return null
  }

  if (!expanded) {
    return <div className="flex flex-col items-center gap-1.5">{children}</div>
  }

  return (
    <SidebarGroup className="p-0">
      {label ? (
        <SidebarGroupLabel className="h-7 rounded-[5px] px-2 text-foreground/50 dark:text-sidebar-foreground/48" style={typographyStyle('ui.overline')}>
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

function RailMenuItem({ children, expanded }: { children: ReactNode; expanded: boolean }) {
  if (!expanded) {
    return children
  }

  return <SidebarMenuItem>{children}</SidebarMenuItem>
}

function RailPlaceholderSection({
  active,
  children,
  defaultOpen,
  expanded,
  icon: Icon,
  label,
  onAdd,
  onClick,
  showDisclosure,
}: RailPlaceholderSectionProps) {
  const [open, setOpen] = useState(() => Boolean(defaultOpen))
  const hasChildren = Boolean(children)
  const showsDisclosure = hasChildren || showDisclosure
  const labelContent = (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className={cn('truncate', active ? 'font-semibold text-sidebar-foreground' : null)}>
        {label}
      </span>
    </>
  )

  if (!expanded) {
    return (
      <RailItem
        active={active}
        expanded={expanded}
        icon={Icon}
        label={label}
        onClick={onClick}
      />
    )
  }

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="h-8 rounded-[5px] px-2 text-sidebar-foreground/68" style={typographyStyle('ui.label')}>
        {hasChildren ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 pr-7">
            <button
              className="flex min-w-0 items-center gap-1.5 text-left active:scale-[0.99]"
              onClick={onClick ?? (() => setOpen((current) => !current))}
              type="button"
            >
              {labelContent}
            </button>
            <button
              aria-expanded={open}
              aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-sidebar-foreground/45 transition-[background-color,color,transform] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-[0.94]"
              onClick={() => setOpen((current) => !current)}
              type="button"
            >
              {open ? (
                <IconChevronDown className="size-3" />
              ) : (
                <IconChevronRight className="size-3" />
              )}
            </button>
          </div>
        ) : onClick ? (
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 pr-7 text-left active:scale-[0.99]"
            onClick={onClick}
            type="button"
          >
            {labelContent}
            {showsDisclosure ? (
              <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/45" />
            ) : null}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 pr-7 text-left">
            {labelContent}
            {showsDisclosure ? (
              <IconChevronRight className="size-3 shrink-0 text-sidebar-foreground/45" />
            ) : null}
          </span>
        )}
      </SidebarGroupLabel>
      <SidebarGroupAction
        aria-label={`Create ${label}`}
        className="top-1 right-1.5 size-6 rounded-[5px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-45"
        disabled={!onAdd}
        onClick={onAdd}
        type="button"
      >
        <IconPlus className="size-3.5" />
      </SidebarGroupAction>
      {hasChildren && open ? (
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5 pl-6 pr-1">{children}</SidebarMenu>
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
}

function RailSubItem({
  active,
  accentColor,
  expanded,
  label,
  onClick,
}: {
  active?: boolean
  accentColor?: string
  expanded: boolean
  label: string
  onClick?: () => void
}) {
  if (!expanded) {
    return null
  }

  return (
    <SidebarMenuItem>
      <Button
        aria-current={active ? 'page' : undefined}
        className={cn(
          'h-7 w-full justify-start rounded-[5px] px-2 active:scale-[0.99]',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/55'
        )}
        onClick={onClick}
        style={typographyStyle('ui.label')}
        type="button"
        variant="ghost"
      >
        {accentColor ? (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
        ) : null}
        <span className="truncate">{label}</span>
      </Button>
    </SidebarMenuItem>
  )
}

function RailBrand({
  expanded,
  logo,
  onBrand,
  onExpand,
}: {
  expanded: boolean
  logo?: ReactNode
  onBrand?: () => void
  onExpand: () => void
}) {
  const mark = logo ?? (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
      K
    </span>
  )

  if (!expanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label="Expand rail"
            className="group relative flex size-8 items-center justify-center rounded-lg text-sidebar-foreground/75 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring active:scale-95"
            onClick={onExpand}
            type="button"
          >
            <span className="transition-opacity group-hover:opacity-0 group-focus-visible:opacity-0">
              {mark}
            </span>
            <IconLayoutSidebarLeftExpand className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand rail</TooltipContent>
      </Tooltip>
    )
  }

  if (onBrand) {
    return (
      <button
        aria-label="kai-chattr home"
        className="flex size-8 items-center justify-center rounded-lg active:scale-95"
        onClick={onBrand}
        type="button"
      >
        {mark}
      </button>
    )
  }

  return (
    <div aria-hidden="true" className="flex size-8 items-center justify-center">
      {mark}
    </div>
  )
}

function AccountAvatar({ account }: { account: WorkbenchCompactRailAccount }) {
  return (
    <Avatar className="size-9 rounded-full">
      <AvatarImage alt={account.label} src={account.avatarUrl} />
      <AvatarFallback className="rounded-full text-xs font-medium">
        {account.initials}
      </AvatarFallback>
    </Avatar>
  )
}

export function WorkbenchCompactRail({
  activeItem = 'conversations',
  activeAgentId,
  activeProjectId,
  account = {
    initials: 'J',
    label: 'Jon',
    secondaryLabel: 'Local workspace',
    status: 'online',
  },
  agentEntries,
  className,
  defaultExpanded = true,
  logo,
  projectEntries,
  recentEntries,
  sessions,
  taskEntries,
  utilities,
  onAccount,
  onBilling,
  onBrand,
  onCreateAgent,
  onCreateChat,
  onCreateLibrary,
  onCreateProject,
  onCreateTask,
  onLogOut,
  onNewSession,
  onNotifications,
  onOpenAgents,
  onOpenFileStores,
  onOpenIntegrations,
  onOpenKnowledgeBases,
  onOpenLibrary,
  onOpenObservability,
  onOpenProjects,
  onOpenSearch,
  onOpenSettings,
  onShowConversations,
  onShowTasks,
}: WorkbenchCompactRailProps) {
  const [expanded, setExpandedState] = useState(() => readPersistedRailExpanded(defaultExpanded))
  const setExpanded = useCallback((nextExpanded: boolean) => {
    setExpandedState(nextExpanded)
    writePersistedRailExpanded(nextExpanded)
  }, [])
  const accountStatus = account.status ?? 'online'
  const handleSettings = onAccount ?? onOpenSettings
  const handleBilling = onBilling ?? onOpenSettings
  const handleNotifications = onNotifications ?? onOpenSettings
  const libraryActive = activeItem === 'library' || activeItem === 'file-stores' || activeItem === 'knowledge-bases'
  const agentsActive = activeItem === 'agents'
  const projectsActive = activeItem === 'projects'

  return (
    <TooltipProvider delayDuration={150}>
    <aside
      aria-label="Workbench shell rail"
      className={cn(
        'flex h-full min-h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        expanded ? 'w-64' : 'w-[60px]',
        className
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center gap-2', expanded ? 'pr-2 pl-3' : 'justify-center')}>
        <RailBrand
          expanded={expanded}
          logo={logo}
          onBrand={onBrand}
          onExpand={() => setExpanded(true)}
        />
        {expanded ? <span className="truncate" style={typographyStyle('ui.body-strong')}>kai-chattr</span> : null}
        {expanded ? (
          <Button
            aria-label="Collapse rail"
            className="ml-auto size-8 rounded-[5px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95"
            onClick={() => setExpanded(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconLayoutSidebarLeftCollapse className="size-4" />
          </Button>
        ) : null}
      </div>

      <SidebarContent
        aria-label="Workbench navigation"
        className={cn(
          'min-h-0 flex-1',
          expanded ? 'mt-4 gap-4 overflow-y-auto px-2' : 'mt-4 items-center gap-1.5 overflow-hidden px-0'
        )}
      >
        <RailSection expanded={expanded}>
          <RailMenuItem expanded={expanded}>
            <RailItem
              active={activeItem === 'new-session'}
              expanded={expanded}
              icon={IconPlus}
              label="New chat"
              onClick={onNewSession}
            />
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailItem
              active={activeItem === 'search'}
              expanded={expanded}
              icon={IconSearch}
              label="Search"
              onClick={onOpenSearch}
            />
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailItem
              active={activeItem === 'integrations'}
              expanded={expanded}
              icon={IconPlugConnected}
              label="Integrations"
              onClick={onOpenIntegrations}
            />
          </RailMenuItem>
        </RailSection>

        <RailSection expanded={expanded}>
          <RailMenuItem expanded={expanded}>
            <RailPlaceholderSection
              active={agentsActive}
              defaultOpen={agentsActive || Boolean(activeAgentId)}
              expanded={expanded}
              icon={IconRobot}
              label="My Agents"
              onAdd={onCreateAgent}
              onClick={onOpenAgents}
              showDisclosure
            >
              {agentEntries?.length
                ? agentEntries.map((entry) => (
                    <RailSubItem
                      accentColor={entry.accentColor}
                      active={activeAgentId === entry.id}
                      expanded={expanded}
                      key={entry.id}
                      label={entry.label}
                      onClick={entry.onSelect}
                    />
                  ))
                : null}
            </RailPlaceholderSection>
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailPlaceholderSection
              active={libraryActive}
              defaultOpen={libraryActive}
              expanded={expanded}
              icon={IconLibrary}
              label="Library"
              onAdd={onCreateLibrary}
              onClick={onOpenLibrary}
            >
              <RailSubItem
                active={activeItem === 'file-stores'}
                expanded={expanded}
                label="File Stores"
                onClick={onOpenFileStores}
              />
              <RailSubItem
                active={activeItem === 'knowledge-bases'}
                expanded={expanded}
                label="Knowledge Bases"
                onClick={onOpenKnowledgeBases}
              />
            </RailPlaceholderSection>
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailPlaceholderSection
              active={projectsActive}
              defaultOpen={projectsActive || Boolean(activeProjectId)}
              expanded={expanded}
              icon={IconFolder}
              label="Projects"
              onAdd={onCreateProject}
              onClick={onOpenProjects}
              showDisclosure
            >
              {projectEntries?.length
                ? projectEntries.map((entry) => (
                    <RailSubItem
                      accentColor={entry.accentColor}
                      active={activeProjectId === entry.id}
                      expanded={expanded}
                      key={entry.id}
                      label={entry.label}
                      onClick={entry.onSelect}
                    />
                  ))
                : null}
            </RailPlaceholderSection>
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailPlaceholderSection
              active={activeItem === 'tasks'}
              defaultOpen={Boolean(taskEntries?.length)}
              expanded={expanded}
              icon={IconListCheck}
              label="Tasks"
              onAdd={onCreateTask}
              onClick={onShowTasks}
              showDisclosure
            >
              {taskEntries?.length
                ? taskEntries.map((entry) => (
                    <RailSubItem
                      expanded={expanded}
                      key={entry.id}
                      label={entry.label}
                      onClick={entry.onSelect}
                    />
                  ))
                : null}
            </RailPlaceholderSection>
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailPlaceholderSection
              active={activeItem === 'conversations'}
              defaultOpen={Boolean(recentEntries?.length)}
              expanded={expanded}
              icon={IconMessages}
              label="Recent"
              onAdd={onCreateChat ?? onNewSession}
              onClick={onShowConversations}
              showDisclosure
            >
              {recentEntries?.length
                ? recentEntries.map((entry) => (
                    <RailSubItem
                      expanded={expanded}
                      key={entry.id}
                      label={entry.label}
                      onClick={entry.onSelect}
                    />
                  ))
                : null}
            </RailPlaceholderSection>
          </RailMenuItem>
        </RailSection>

        {expanded && sessions ? (
          <RailSection expanded={expanded} label="Recent">
            <SidebarMenuItem>{sessions}</SidebarMenuItem>
          </RailSection>
        ) : null}
      </SidebarContent>

      <div
        className={cn(
          'mt-auto flex flex-col gap-1 py-2',
          expanded ? 'px-2' : 'items-center px-0'
        )}
      >
        {utilities ? (
          <div className={cn('flex flex-col gap-1.5', expanded ? 'w-full' : 'items-center')}>
            {utilities({ expanded })}
          </div>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {expanded ? (
              <Button
                aria-label={`${account.label} account`}
                className="h-10 w-full justify-start gap-2 rounded-[5px] px-2 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent active:scale-95"
                type="button"
                variant="ghost"
              >
                <span className="relative shrink-0">
                  <AccountAvatar account={account} />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-sidebar',
                      statusClassName[accountStatus]
                    )}
                  />
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate" style={typographyStyle('ui.body-strong')}>{account.label}</span>
                  {account.secondaryLabel ? (
                    <span className="truncate text-muted-foreground" style={typographyStyle('ui.caption')}>
                      {account.secondaryLabel}
                    </span>
                  ) : null}
                </span>
              </Button>
            ) : (
              <Button
                aria-label={`${account.label} account`}
                className="relative size-[42px] rounded-full p-0 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground active:scale-95"
                size="icon"
                type="button"
                variant="ghost"
              >
                <AccountAvatar account={account} />
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-0.5 bottom-0.5 size-1.5 rounded-full ring-2 ring-sidebar',
                    statusClassName[accountStatus]
                  )}
                />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-64 rounded-lg"
            side="right"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <AccountAvatar account={account} />
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{account.label}</span>
                  {account.secondaryLabel ? (
                    <span className="truncate text-xs text-muted-foreground">
                      {account.secondaryLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={onOpenObservability}>
                <IconActivityHeartbeat />
                Observability
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={handleSettings}>
                <IconSettings2 />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleBilling}>
                <IconCreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleNotifications}>
                <IconBell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onLogOut} variant="destructive">
              <IconLogout />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
    </TooltipProvider>
  )
}
