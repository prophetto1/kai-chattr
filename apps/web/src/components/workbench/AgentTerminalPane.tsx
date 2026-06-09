'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IconRefresh } from '@tabler/icons-react'

import {
  Terminal,
  TerminalContent,
} from '@/components/ai-elements/terminal'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/chattr-api'
import { getTerminalSnapshot, type TerminalSnapshot } from '@/lib/terminal-api'

type TerminalLoadState = 'loading' | 'ready' | 'empty' | 'error'

type AgentTerminalPaneProps = {
  agentName: string
  pollIntervalMs?: number
}

function normalizeTerminalText(snapshot: TerminalSnapshot | null, agentName: string) {
  if (!snapshot?.text.trim()) {
    return `No terminal snapshot for ${agentName} yet.\nStart or attach an agent wrapper to stream its visible terminal buffer.`
  }

  return snapshot.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function snapshotAgeLabel(snapshot: TerminalSnapshot | null) {
  if (!snapshot?.received_at) {
    return 'No snapshot'
  }

  const ageMs = Math.max(0, Date.now() - snapshot.received_at * 1000)
  if (ageMs < 1000) {
    return 'Live'
  }
  if (ageMs < 60_000) {
    return `${Math.round(ageMs / 1000)}s old`
  }
  return `${Math.round(ageMs / 60_000)}m old`
}

export function AgentTerminalPane({
  agentName,
  pollIntervalMs = 2500,
}: AgentTerminalPaneProps) {
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(null)
  const [loadState, setLoadState] = useState<TerminalLoadState>('loading')
  const [lastError, setLastError] = useState('')

  const loadSnapshot = useCallback(async () => {
    try {
      const payload = await getTerminalSnapshot(agentName)
      setSnapshot(payload.snapshot)
      setLoadState(payload.snapshot ? 'ready' : 'empty')
      setLastError('')
    } catch (error) {
      setLoadState('error')
      setLastError(errorMessage(error))
    }
  }, [agentName])

  useEffect(() => {
    void loadSnapshot()
    const interval = window.setInterval(() => {
      void loadSnapshot()
    }, pollIntervalMs)
    return () => window.clearInterval(interval)
  }, [loadSnapshot, pollIntervalMs])

  const renderedText = useMemo(
    () => normalizeTerminalText(snapshot, agentName),
    [agentName, snapshot]
  )

  const statusLabel = loadState === 'error'
    ? lastError || 'Terminal unavailable'
    : snapshotAgeLabel(snapshot)

  return (
    <Terminal
      autoScroll
      className="h-full rounded-none border-0 bg-zinc-950"
      output={renderedText}
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-zinc-800 px-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
          <span className="truncate text-xs font-medium">{agentName}</span>
          <span
            className="truncate text-[11px] text-zinc-400"
            data-testid="terminal-status"
          >
            {statusLabel}
          </span>
        </div>
        <Button
          aria-label="Refresh terminal snapshot"
          className="ml-auto size-6 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => void loadSnapshot()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <IconRefresh className="size-3.5" />
        </Button>
      </div>
      <TerminalContent
        aria-label={`${agentName} terminal snapshot`}
        className="max-h-none min-h-0 flex-1 p-3"
        data-testid="terminal-output"
      />
      <pre className="sr-only" data-testid="terminal-snapshot-text">
        {renderedText}
      </pre>
    </Terminal>
  )
}
