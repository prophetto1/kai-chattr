'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconCornerDownLeft, IconRobot, IconX } from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import {
  getTerminalRuntimes,
  sendTerminalInput,
  type AgentRuntimeCard,
} from '@/lib/terminal-api'
import { cn } from '@/lib/cn'

const AUTOHIDE_MS = 8000

/**
 * Agent runtime signal + overlay (Jon's spec): a quiet rail trigger that
 * carries an amber count circle while approvals are pending (red is reserved
 * for failures), and a popup card stack overlaying the dock — no layout push.
 * The popup autohides after ~8s without interaction; the badge never does.
 * Auto-surfaces when a new approval is detected.
 */
export function AgentRuntimeOverlay() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const hideTimer = useRef<number | null>(null)
  const prevPending = useRef(0)
  const queryClient = useQueryClient()

  const runtimes = useQuery({
    queryKey: ['terminal-runtimes'],
    queryFn: getTerminalRuntimes,
    refetchInterval: 3000,
  })
  const agents = runtimes.data?.agents ?? []
  const liveAgents = agents.filter((agent) => agent.has_snapshot)
  const pending = runtimes.data?.pending_approvals ?? 0

  const input = useMutation({
    mutationFn: (vars: { agent: string; keys: string }) =>
      sendTerminalInput(vars.agent, vars.keys),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['terminal-runtimes'] })
    },
  })

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const armHideTimer = useCallback(() => {
    clearHideTimer()
    hideTimer.current = window.setTimeout(() => setOpen(false), AUTOHIDE_MS)
  }, [clearHideTimer])

  // Auto-surface when a new approval appears; badge persists regardless.
  useEffect(() => {
    if (pending > prevPending.current) {
      setOpen(true)
      armHideTimer()
    }
    prevPending.current = pending
  }, [pending, armHideTimer])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  const toggle = () => {
    setOpen((current) => {
      const next = !current
      if (next) {
        armHideTimer()
      } else {
        clearHideTimer()
      }
      return next
    })
  }

  return (
    <>
      <Button
        aria-label={
          pending > 0
            ? `Agent runtimes — ${pending} approval${pending === 1 ? '' : 's'} pending`
            : 'Agent runtimes'
        }
        className="relative mt-auto mb-1.5 size-9 rounded-[5px] p-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        onClick={toggle}
        size="icon"
        variant="ghost"
      >
        <IconRobot className="size-[18px]" />
        {pending > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-semibold text-black">
            {pending}
          </span>
        ) : liveAgents.length > 0 ? (
          <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-emerald-500/80" />
        ) : null}
      </Button>

      {open ? (
        <div
          className="fixed bottom-3 right-12 z-50 flex w-[400px] flex-col gap-2 rounded-lg border bg-popover p-2 shadow-xl"
          onMouseEnter={clearHideTimer}
          onMouseLeave={armHideTimer}
          role="dialog"
          aria-label="Agent runtimes"
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-muted-foreground">
              Agent runtimes
            </span>
            <Button
              aria-label="Close"
              className="size-6 p-0"
              onClick={() => setOpen(false)}
              size="icon"
              variant="ghost"
            >
              <IconX className="size-3.5" />
            </Button>
          </div>
          {liveAgents.length === 0 ? (
            <div className="px-1 pb-1 text-xs text-muted-foreground">
              No headless agents reporting.
            </div>
          ) : (
            liveAgents.map((agent) => (
              <RuntimeCard
                agent={agent}
                expanded={expanded === agent.name}
                key={agent.name}
                onSend={(keys) => input.mutate({ agent: agent.name, keys })}
                onToggle={() =>
                  setExpanded((current) => (current === agent.name ? null : agent.name))
                }
                sending={input.isPending && input.variables?.agent === agent.name}
              />
            ))
          )}
        </div>
      ) : null}
    </>
  )
}

function RuntimeCard(props: {
  agent: AgentRuntimeCard
  expanded: boolean
  onSend: (keys: string) => void
  onToggle: () => void
  sending: boolean
}) {
  const { agent, expanded, onSend, onToggle, sending } = props
  const [custom, setCustom] = useState('')
  const stale = agent.snapshot_age_ms > 15000

  return (
    <div className="rounded-md border bg-background/60">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        onClick={onToggle}
        type="button"
      >
        <span
          className={cn(
            'size-2 shrink-0 rounded-full',
            agent.approval_needed
              ? 'bg-amber-500'
              : stale
                ? 'bg-zinc-500'
                : 'bg-emerald-500'
          )}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {agent.name}
        </span>
        {agent.approval_needed ? (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
            Approval needed
          </span>
        ) : (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {stale ? 'stale' : 'live'}
          </span>
        )}
      </button>
      {agent.approval_needed && !expanded ? (
        <div className="truncate px-2.5 pb-2 text-[11px] text-muted-foreground">
          {agent.approval_hint}
        </div>
      ) : null}
      {expanded ? (
        <div className="flex flex-col gap-2 border-t px-2.5 py-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 font-mono text-[10px] leading-snug text-zinc-200">
            {agent.screen_tail || '(no screen reported)'}
          </pre>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              className="h-6 px-2 text-[11px]"
              disabled={sending}
              onClick={() => onSend('y')}
              size="sm"
            >
              Approve (y)
            </Button>
            <Button
              className="h-6 px-2 text-[11px]"
              disabled={sending}
              onClick={() => onSend('1')}
              size="sm"
              variant="outline"
            >
              1
            </Button>
            <Button
              className="h-6 px-2 text-[11px]"
              disabled={sending}
              onClick={() => onSend('2')}
              size="sm"
              variant="outline"
            >
              2
            </Button>
            <Button
              aria-label="Send Enter"
              className="h-6 px-2 text-[11px]"
              disabled={sending}
              onClick={() => onSend('')}
              size="sm"
              variant="outline"
            >
              <IconCornerDownLeft className="size-3" />
            </Button>
            <input
              className="h-6 min-w-0 flex-1 rounded border bg-transparent px-1.5 text-[11px] outline-none"
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSend(custom)
                  setCustom('')
                }
              }}
              placeholder="keys…"
              value={custom}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
