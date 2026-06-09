'use client'

import {
  IconBell,
  IconBrain,
  IconCircleCheck,
  IconCreditCard,
  IconDatabase,
  IconFolder,
  IconLibrary,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconMessages,
  IconPlus,
  IconPlugConnected,
  IconRobot,
  IconSearch,
  IconSettings2,
  IconSparkles,
} from '@tabler/icons-react'
import { type ComponentType, type CSSProperties, type ReactNode, useState } from 'react'

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

type WorkbenchCompactRailItem =
  | 'new-session'
  | 'search'
  | 'library'
  | 'integrations'
  | 'agents'
  | 'registries'
  | 'self-learning'
  | 'projects'
  | 'conversations'
  | 'settings'

type WorkbenchCompactRailAccount = {
  avatarUrl?: string
  initials: string
  label: string
  secondaryLabel?: string
  status?: 'online' | 'idle' | 'offline'
}

type WorkbenchCompactRailProps = {
  activeItem?: WorkbenchCompactRailItem
  account?: WorkbenchCompactRailAccount
  className?: string
  /** Open (expanded sidebar) by default; collapse toggles to the 60px icon rail. */
  defaultExpanded?: boolean
  /** Brand mark for the reserved top-left slot. Falls back to a lettermark. */
  logo?: ReactNode
  /** Sessions list — rendered under a "Sessions" heading when expanded. Wire your
   *  conversation data here; the rail does not fetch it. */
  sessions?: ReactNode
  onAccount?: () => void
  onBilling?: () => void
  onBrand?: () => void
  onCreateAgent?: () => void
  onCreateChat?: () => void
  onCreateProject?: () => void
  onCreateRegistry?: () => void
  onCreateSelfLearning?: () => void
  onLogOut?: () => void
  onNewSession?: () => void
  onNotifications?: () => void
  onOpenAgents?: () => void
  onOpenIntegrations?: () => void
  onOpenLibrary?: () => void
  onOpenProjects?: () => void
  onOpenRegistries?: () => void
  onOpenSearch?: () => void
  onOpenSelfLearning?: () => void
  onOpenSettings?: () => void
  onShowConversations?: () => void
  onUpgrade?: () => void
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
  expanded: boolean
  icon: ComponentType<{ className?: string }>
  label: string
  onAdd?: () => void
  onClick?: () => void
}

const statusClassName = {
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground',
  online: 'bg-emerald-400',
} satisfies Record<NonNullable<WorkbenchCompactRailAccount['status']>, string>

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
          ? 'h-8 w-full justify-start gap-2.5 rounded-[5px] px-2 text-[13px] font-medium leading-[1.35]'
          : 'size-9 rounded-[5px]',
        active
          ? 'bg-transparent font-semibold hover:bg-transparent'
          : 'hover:bg-sidebar-accent/55'
      )}
      onClick={onClick}
      size={expanded ? 'default' : 'icon'}
      style={itemStyle}
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
        <SidebarGroupLabel className="h-7 rounded-[5px] px-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/50 dark:text-sidebar-foreground/48">
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
  expanded,
  icon: Icon,
  label,
  onAdd,
  onClick,
}: RailPlaceholderSectionProps) {
  const labelContent = (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className={cn('truncate', active ? 'font-semibold text-sidebar-foreground' : null)}>
        {label}
      </span>
    </>
  )

  if (!expanded) {
    return null
  }

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="h-8 rounded-[5px] px-2 text-[12px] font-medium normal-case tracking-normal text-sidebar-foreground/68">
        {onClick ? (
          <button
            className="flex min-w-0 flex-1 items-center gap-2 text-left active:scale-[0.99]"
            onClick={onClick}
            type="button"
          >
            {labelContent}
          </button>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
            {labelContent}
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
    </SidebarGroup>
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
  account = {
    initials: 'J',
    label: 'Jon',
    secondaryLabel: 'Local workspace',
    status: 'online',
  },
  className,
  defaultExpanded = true,
  logo,
  sessions,
  onAccount,
  onBilling,
  onBrand,
  onCreateAgent,
  onCreateChat,
  onCreateProject,
  onCreateRegistry,
  onCreateSelfLearning,
  onLogOut,
  onNewSession,
  onNotifications,
  onOpenAgents,
  onOpenIntegrations,
  onOpenLibrary,
  onOpenProjects,
  onOpenRegistries,
  onOpenSearch,
  onOpenSelfLearning,
  onOpenSettings,
  onShowConversations,
  onUpgrade,
}: WorkbenchCompactRailProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const accountStatus = account.status ?? 'online'
  const handleAccount = onAccount ?? onOpenSettings
  const handleBilling = onBilling ?? onOpenSettings
  const handleIntegrations = onOpenIntegrations ?? onOpenSettings
  const handleNotifications = onNotifications ?? onOpenSettings

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
        {expanded ? <span className="truncate text-[13px] font-semibold">kai-chattr</span> : null}
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
              active={activeItem === 'library'}
              expanded={expanded}
              icon={IconLibrary}
              label="Library"
              onClick={onOpenLibrary}
            />
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailItem
              active={activeItem === 'integrations'}
              expanded={expanded}
              icon={IconPlugConnected}
              label="Integrations"
              onClick={handleIntegrations}
            />
          </RailMenuItem>
          <RailMenuItem expanded={expanded}>
            <RailItem
              active={activeItem === 'settings'}
              expanded={expanded}
              icon={IconSettings2}
              label="Settings"
              onClick={onOpenSettings}
            />
          </RailMenuItem>
        </RailSection>

        {expanded ? (
          <div className="flex flex-col gap-2.5">
            <RailPlaceholderSection
              active={activeItem === 'agents'}
              expanded={expanded}
              icon={IconRobot}
              label="Agents"
              onAdd={onCreateAgent}
              onClick={onOpenAgents}
            />
            <RailPlaceholderSection
              active={activeItem === 'registries'}
              expanded={expanded}
              icon={IconDatabase}
              label="Registries"
              onAdd={onCreateRegistry}
              onClick={onOpenRegistries}
            />
            <RailPlaceholderSection
              active={activeItem === 'self-learning'}
              expanded={expanded}
              icon={IconBrain}
              label="Self-Learning"
              onAdd={onCreateSelfLearning}
              onClick={onOpenSelfLearning}
            />
            <RailPlaceholderSection
              active={activeItem === 'projects'}
              expanded={expanded}
              icon={IconFolder}
              label="Projects"
              onAdd={onCreateProject}
              onClick={onOpenProjects}
            />
            <RailPlaceholderSection
              active={activeItem === 'conversations'}
              expanded={expanded}
              icon={IconMessages}
              label="Chats"
              onAdd={onCreateChat ?? onNewSession}
              onClick={onShowConversations}
            />
          </div>
        ) : null}

        {expanded && sessions ? (
          <RailSection expanded={expanded} label="Chats">
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
                  <span className="truncate text-[13px] font-medium">{account.label}</span>
                  {account.secondaryLabel ? (
                    <span className="truncate text-[11px] text-muted-foreground">
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
              <DropdownMenuItem onSelect={onUpgrade}>
                <IconSparkles />
                Upgrade workspace
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={handleAccount}>
                <IconCircleCheck />
                Account
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
