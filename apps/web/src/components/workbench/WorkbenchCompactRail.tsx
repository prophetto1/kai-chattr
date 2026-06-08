'use client'

import {
  IconBell,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconCreditCard,
  IconList,
  IconLogout,
  IconPlus,
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
import { cn } from '@/lib/cn'

type WorkbenchCompactRailItem = 'new-session' | 'conversations' | 'settings'

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
  onLogOut?: () => void
  onNewSession?: () => void
  onNotifications?: () => void
  onOpenSettings?: () => void
  onShowConversations?: () => void
  onUpgrade?: () => void
}

type RailItemProps = {
  active?: boolean
  expanded: boolean
  icon: ComponentType<{ size?: number | string; stroke?: number; className?: string }>
  label: string
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
          ? 'h-[26px] w-full justify-start gap-2 rounded-[5px] px-1.5 text-[13px] font-medium leading-[1.35]'
          : 'size-[42px] rounded-[5px]',
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
      <Icon className={expanded ? 'size-[13px] shrink-0' : 'size-[22px]'} stroke={1.75} />
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

function RailBrand({ logo, onBrand }: { logo?: ReactNode; onBrand?: () => void }) {
  const mark = logo ?? (
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
      K
    </span>
  )

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
    <Avatar className="size-8 rounded-full" size="sm">
      <AvatarImage alt={account.label} src={account.avatarUrl} />
      <AvatarFallback className="rounded-full text-[11px] font-medium">
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
  onLogOut,
  onNewSession,
  onNotifications,
  onOpenSettings,
  onShowConversations,
  onUpgrade,
}: WorkbenchCompactRailProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const accountStatus = account.status ?? 'online'
  const handleAccount = onAccount ?? onOpenSettings
  const handleBilling = onBilling ?? onOpenSettings
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
        <RailBrand logo={logo} onBrand={onBrand} />
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
            <IconChevronLeft className="size-4" />
          </Button>
        ) : null}
      </div>

      {!expanded ? (
        <div className="flex justify-center pb-1">
          <Button
            aria-label="Expand rail"
            className="size-[42px] rounded-[5px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95"
            onClick={() => setExpanded(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      ) : null}

      <nav
        aria-label="Workbench actions"
        className={cn('flex flex-col', expanded ? 'mt-3 gap-2.5 px-2' : 'mt-3 items-center gap-2.5 px-0')}
      >
        <RailItem
          active={activeItem === 'new-session'}
          expanded={expanded}
          icon={IconPlus}
          label="New session"
          onClick={onNewSession}
        />
        <RailItem
          active={activeItem === 'conversations'}
          expanded={expanded}
          icon={IconList}
          label="Past conversations"
          onClick={onShowConversations}
        />
      </nav>

      {expanded && sessions ? (
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5">
          <div className="mb-1 px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-foreground/50 dark:text-sidebar-foreground/48">
            Sessions
          </div>
          {sessions}
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div
        className={cn(
          'mt-auto flex flex-col gap-px py-2',
          expanded ? 'px-1.5' : 'items-center px-0'
        )}
      >
        <RailItem
          active={activeItem === 'settings'}
          expanded={expanded}
          icon={IconSettings2}
          label="Settings"
          onClick={onOpenSettings}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {expanded ? (
              <Button
                aria-label={`${account.label} account`}
                className="h-10 w-full justify-start gap-2 rounded-[5px] px-1.5 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent active:scale-95"
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
