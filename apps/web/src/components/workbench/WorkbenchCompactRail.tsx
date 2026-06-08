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
import { type ComponentType, type ReactNode, useState } from 'react'

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
  const button = (
    <Button
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={cn(
        'text-muted-foreground active:scale-95 hover:bg-accent hover:text-foreground [&_svg]:size-[18px]',
        expanded
          ? 'h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-[13px] font-medium'
          : 'size-10 rounded-lg',
        active && 'bg-accent text-foreground'
      )}
      onClick={onClick}
      size={expanded ? 'default' : 'icon'}
      type="button"
      variant="ghost"
    >
      <Icon />
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
    <aside
      aria-label="Workbench shell rail"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        expanded ? 'w-64' : 'w-[60px]',
        className
      )}
    >
      <div className={cn('flex h-12 shrink-0 items-center gap-2', expanded ? 'pr-2 pl-3' : 'justify-center')}>
        <RailBrand logo={logo} onBrand={onBrand} />
        {expanded ? <span className="truncate text-sm font-semibold">kai-chattr</span> : null}
        {expanded ? (
          <Button
            aria-label="Collapse rail"
            className="ml-auto size-7 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
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
            className="size-9 text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
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
        className={cn('flex flex-col gap-1 px-2', expanded ? '' : 'items-center')}
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
        <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
          <div className="px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </div>
          {sessions}
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div
        className={cn(
          'mt-auto flex flex-col gap-1 border-t border-sidebar-border p-2',
          expanded ? '' : 'items-center'
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
                className="h-12 w-full justify-start gap-2.5 rounded-lg px-2 hover:bg-accent data-[state=open]:bg-accent active:scale-95"
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
                className="relative size-9 rounded-full p-0 hover:bg-accent data-[state=open]:bg-accent data-[state=open]:text-accent-foreground active:scale-95"
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
  )
}
