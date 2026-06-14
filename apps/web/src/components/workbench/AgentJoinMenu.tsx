import { useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconUserPlus } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/cn'
import { agentNameFromProfileId } from '@/lib/agent-runtime-api'
import {
  getAgentLauncherPreflight,
  startAgentLauncher,
  type AgentLauncherProfile,
} from '@/lib/launcher-api'
import { getTerminalRuntimes, type AgentRuntimeCard } from '@/lib/terminal-api'
import { typographyStyle } from '@/lib/design-system'

const STALE_MS = 15000

function presenceClass(entry: AgentRuntimeCard | undefined) {
  if (!entry?.registered) {
    return 'bg-muted-foreground/40'
  }
  if (entry.stuck || entry.snapshot_age_ms > STALE_MS) {
    return 'bg-amber-500'
  }
  return 'bg-emerald-500'
}

export function AgentJoinMenu({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const runtimes = useQuery({
    queryFn: getTerminalRuntimes,
    queryKey: ['terminal-runtimes'],
    refetchInterval: 3000,
  })
  const preflight = useQuery({
    enabled: open,
    queryFn: getAgentLauncherPreflight,
    queryKey: ['agent-launcher-preflight'],
    refetchInterval: open ? 5000 : false,
  })

  const join = useMutation({
    mutationFn: (profileId: string) => startAgentLauncher(profileId, false, true),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['terminal-runtimes'] })
    },
  })

  const agents = runtimes.data?.agents ?? []
  const registered = agents.filter((a) => a.registered)
  const profiles = (preflight.data?.profiles ?? []).filter(
    (p: AgentLauncherProfile) => !p.requires_explicit_confirmation
  )

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Agents in chat"
          className={cn('h-7 gap-1.5 px-2 text-xs text-muted-foreground', className)}
          size="sm"
          variant="ghost"
        >
          <IconUserPlus className="size-3.5" />
          Agents
          {registered.length > 0 ? (
            <span className="flex items-center gap-0.5">
              {registered.slice(0, 4).map((a) => (
                <span
                  aria-label={`${a.name} online`}
                  className={cn('size-1.5 rounded-full', presenceClass(a))}
                  key={a.name}
                  title={a.name}
                />
              ))}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">Join an agent to this chat</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {profiles.length === 0 ? (
          <DropdownMenuItem disabled>
            {preflight.isLoading ? 'Checking launchers…' : 'No launchable agents'}
          </DropdownMenuItem>
        ) : (
          profiles.map((p: AgentLauncherProfile) => {
            const agentName = agentNameFromProfileId(p.profile_id) ?? p.profile_id
            const entry = agents.find(
              (a) => a.name === agentName || a.name.startsWith(`${agentName}-`)
            )
            const inChat = Boolean(entry?.registered)
            const joining = join.isPending && join.variables === p.profile_id
            return (
              <DropdownMenuItem
                disabled={!p.ready || inChat || joining}
                key={p.profile_id}
                onSelect={(event) => {
                  event.preventDefault()
                  join.mutate(p.profile_id)
                }}
              >
                <span
                  aria-hidden
                  className={cn('mr-2 size-2 shrink-0 rounded-full', presenceClass(entry))}
                />
                <span className="min-w-0 flex-1 truncate">{p.label ?? agentName}</span>
                <span className="ml-2 text-muted-foreground" style={typographyStyle('ui.micro')}>
                  {inChat
                    ? 'in chat'
                    : joining
                      ? 'joining…'
                      : p.ready
                        ? 'join'
                        : (p.blocked_reason ?? 'unavailable')}
                </span>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
