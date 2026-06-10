'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { IconLoader2, IconRocket, IconTerminal2 } from '@tabler/icons-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  getAgentLauncherPreflight,
  startAgentLauncher,
  type AgentLauncherProfile,
  type AgentLauncherStartResult,
} from '@/lib/launcher-api'
import { cn } from '@/lib/cn'

type LaunchState = {
  result?: AgentLauncherStartResult
  error?: string
}

export function AgentLauncherDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [confirmedRisky, setConfirmedRisky] = useState<Record<string, boolean>>({})
  const [launchState, setLaunchState] = useState<Record<string, LaunchState>>({})
  const preflight = useQuery({
    enabled: open,
    queryKey: ['agent-launcher-preflight'],
    queryFn: getAgentLauncherPreflight,
    refetchInterval: open ? 5000 : false,
  })
  const profiles = useMemo(
    () => preflight.data?.profiles ?? [],
    [preflight.data?.profiles]
  )
  const launch = useMutation({
    mutationFn: (input: { profileId: string; confirmRisky: boolean }) =>
      startAgentLauncher(input.profileId, input.confirmRisky),
    onError: (error, input) => {
      setLaunchState((current) => ({
        ...current,
        [input.profileId]: {
          error: error instanceof Error ? error.message : 'Launch failed',
        },
      }))
    },
    onSuccess: (result) => {
      setLaunchState((current) => ({
        ...current,
        [result.profile_id]: { result },
      }))
      void preflight.refetch()
    },
  })

  const onLaunch = (profile: AgentLauncherProfile) => {
    const confirmed = confirmedRisky[profile.profile_id] ?? false
    if (profile.requires_explicit_confirmation && !confirmed) {
      setConfirmedRisky((current) => ({
        ...current,
        [profile.profile_id]: true,
      }))
      return
    }
    launch.mutate({
      profileId: profile.profile_id,
      confirmRisky: profile.requires_explicit_confirmation,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              aria-label="Launch agents"
              className={cn(
                compact
                  ? 'size-9 rounded-[5px] p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:scale-95'
                  : 'h-7 gap-1.5 px-2 text-xs'
              )}
              size={compact ? 'icon' : 'sm'}
              variant={compact ? 'ghost' : 'outline'}
            >
              <IconRocket className={compact ? 'size-[18px]' : 'size-3.5'} />
              {compact ? <span className="sr-only">Agents</span> : 'Agents'}
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Launch local agents</TooltipContent>
      </Tooltip>
      <DialogContent className="max-h-[min(720px,calc(100vh-2rem))] max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-sm">Agent launcher</DialogTitle>
          <DialogDescription className="text-xs">
            Fixed local CLI profiles from the kai-chattr backend.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b px-4 py-3">
          <RuntimeLine
            apiPort={preflight.data?.runtime.api_port}
            mcpHttpPort={preflight.data?.runtime.mcp_http_port}
            mcpSsePort={preflight.data?.runtime.mcp_sse_port}
          />
        </div>
        {preflight.isError ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertTitle>Preflight failed</AlertTitle>
              <AlertDescription>
                {preflight.error instanceof Error ? preflight.error.message : 'Unable to load profiles'}
              </AlertDescription>
            </Alert>
          </div>
        ) : null}
        <ScrollArea className="max-h-[520px]">
          <div className="grid gap-3 p-4">
            {preflight.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconLoader2 className="size-4 animate-spin" />
                Checking profiles
              </div>
            ) : null}
            {profiles.map((profile) => (
              <AgentLaunchCard
                confirmedRisky={confirmedRisky[profile.profile_id] ?? false}
                key={profile.profile_id}
                launchState={launchState[profile.profile_id]}
                onLaunch={() => onLaunch(profile)}
                pending={launch.isPending && launch.variables?.profileId === profile.profile_id}
                profile={profile}
              />
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function RuntimeLine(props: {
  apiPort?: number
  mcpHttpPort?: number
  mcpSsePort?: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="outline">API {props.apiPort ?? '...'}</Badge>
      <Badge variant="outline">MCP HTTP {props.mcpHttpPort ?? '...'}</Badge>
      <Badge variant="outline">MCP SSE {props.mcpSsePort ?? '...'}</Badge>
    </div>
  )
}

function AgentLaunchCard(props: {
  confirmedRisky: boolean
  launchState?: LaunchState
  onLaunch: () => void
  pending: boolean
  profile: AgentLauncherProfile
}) {
  const { confirmedRisky, launchState, onLaunch, pending, profile } = props
  const buttonLabel = profile.requires_explicit_confirmation && !confirmedRisky
    ? 'Confirm'
    : pending
      ? 'Starting'
      : 'Launch'

  return (
    <Card className="gap-3 rounded-md py-4 shadow-none">
      <CardHeader className="gap-1 px-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/30">
            <IconTerminal2 className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">{profile.label}</CardTitle>
            <CardDescription className="truncate text-xs">
              {profile.profile_id}
            </CardDescription>
          </div>
          <CardAction>
            <Badge variant={profile.ready ? 'default' : 'secondary'}>
              {profile.ready ? 'Ready' : 'Blocked'}
            </Badge>
          </CardAction>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <div className="flex flex-wrap gap-1.5">
          <CheckBadge label="uv" ok={profile.checks.uv} />
          <CheckBadge label="wrapper" ok={profile.checks.wrapper} />
          <CheckBadge label="provider" ok={profile.checks.provider_cli} />
          {profile.requires_explicit_confirmation ? <Badge variant="outline">Risky</Badge> : null}
        </div>
        {profile.blocked_reason ? (
          <div className="text-xs text-muted-foreground">{profile.blocked_reason}</div>
        ) : null}
        {launchState?.result ? (
          <div className="text-xs text-muted-foreground">
            Started PID {launchState.result.pid}; waiting for {launchState.result.expected_base}.
          </div>
        ) : null}
        {launchState?.error ? (
          <div className="text-xs text-destructive">{launchState.error}</div>
        ) : null}
        <div className="flex justify-end">
          <Button
            className="h-7 px-3 text-xs"
            disabled={!profile.ready || pending}
            onClick={onLaunch}
            size="sm"
          >
            {pending ? <IconLoader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
            {buttonLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CheckBadge(props: { label: string; ok: boolean }) {
  return (
    <Badge variant={props.ok ? 'outline' : 'secondary'}>
      {props.label}: {props.ok ? 'ok' : 'missing'}
    </Badge>
  )
}
