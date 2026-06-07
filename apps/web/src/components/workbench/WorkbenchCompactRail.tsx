'use client'

import {
  IconBell,
  IconCircleCheck,
  IconCreditCard,
  IconList,
  IconLogout,
  IconPlus,
  IconSettings2,
  IconSparkles,
} from '@tabler/icons-react'
import type { ComponentType, ReactNode } from 'react'

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
  /** Brand mark for the reserved top-left slot. Falls back to a lettermark. */
  logo?: ReactNode
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

type RailActionProps = {
  active?: boolean
  icon: ComponentType<{ size?: number | string; stroke?: number; className?: string }>
  label: string
  onClick?: () => void
}

const statusClassName = {
  idle: 'bg-amber-400',
  offline: 'bg-muted-foreground',
  online: 'bg-emerald-400',
} satisfies Record<NonNullable<WorkbenchCompactRailAccount['status']>, string>

function RailAction({ active, icon: Icon, label, onClick }: RailActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          className={cn(
            'size-10 rounded-lg text-muted-foreground active:scale-95 [&_svg]:size-[18px]',
            'hover:bg-accent hover:text-foreground',
            active && 'bg-accent text-foreground'
          )}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon />
        </Button>
      </TooltipTrigger>
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
  logo,
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
  const accountStatus = account.status ?? 'online'
  const handleAccount = onAccount ?? onOpenSettings
  const handleBilling = onBilling ?? onOpenSettings
  const handleNotifications = onNotifications ?? onOpenSettings

  return (
    <aside
      aria-label="Workbench shell rail"
      className={cn(
        'flex h-full w-[60px] shrink-0 flex-col items-center gap-3 border-r border-border bg-background px-2 py-3',
        className
      )}
    >
      <RailBrand logo={logo} onBrand={onBrand} />

      <nav aria-label="Workbench actions" className="flex flex-col items-center gap-2">
        <RailAction
          active={activeItem === 'new-session'}
          icon={IconPlus}
          label="New session"
          onClick={onNewSession}
        />
        <RailAction
          active={activeItem === 'conversations'}
          icon={IconList}
          label="Past conversations"
          onClick={onShowConversations}
        />
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <RailAction
          active={activeItem === 'settings'}
          icon={IconSettings2}
          label="Settings"
          onClick={onOpenSettings}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
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
                  'absolute right-0.5 bottom-0.5 size-1.5 rounded-full ring-2 ring-background',
                  statusClassName[accountStatus]
                )}
              />
            </Button>
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
