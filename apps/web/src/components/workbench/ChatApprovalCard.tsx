import { useMemo, useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  IconCheck,
  IconCornerDownLeft,
  IconDots,
  IconEye,
} from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/cn'
import type { ChattrRoomMessage } from '@/hooks/use-chattr-room'
import {
  getTerminalRuntimes,
  getTerminalSnapshot,
  sendTerminalInput,
} from '@/lib/terminal-api'

type CardMeta = {
  agent: string
  reason: 'approval' | 'stuck'
  hint: string
  detected_at: number
}

export function parseApprovalCardMeta(message: ChattrRoomMessage): CardMeta | null {
  const meta = message.metadata
  if (!meta || meta.card !== 'agent_attention.v1') {
    return null
  }
  const agent = typeof meta.agent === 'string' ? meta.agent : ''
  if (!agent) {
    return null
  }
  return {
    agent,
    detected_at: typeof meta.detected_at === 'number' ? meta.detected_at : 0,
    hint: typeof meta.hint === 'string' ? meta.hint : '',
    reason: meta.reason === 'stuck' ? 'stuck' : 'approval',
  }
}

type CardStatus = 'pending' | 'resolved' | 'offline'

export function ChatApprovalCard({ message }: { message: ChattrRoomMessage }) {
  const meta = parseApprovalCardMeta(message)
  const queryClient = useQueryClient()
  const [customKeys, setCustomKeys] = useState('')
  const [keysOpen, setKeysOpen] = useState(false)
  const [screenOpen, setScreenOpen] = useState(false)

  const runtimes = useQuery({
    queryFn: getTerminalRuntimes,
    queryKey: ['terminal-runtimes'],
    refetchInterval: 3000,
  })

  const snapshot = useQuery({
    enabled: screenOpen && Boolean(meta),
    queryFn: () => getTerminalSnapshot(meta?.agent ?? ''),
    queryKey: ['terminal-snapshot', meta?.agent],
    refetchInterval: screenOpen ? 3000 : false,
  })

  const input = useMutation({
    mutationFn: (keys: string) => sendTerminalInput(meta?.agent ?? '', keys),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['terminal-runtimes'] })
    },
  })

  const status: CardStatus = useMemo(() => {
    if (!meta) {
      return 'offline'
    }
    const entry = runtimes.data?.agents.find((a) => a.name === meta.agent)
    if (!entry?.registered) {
      return 'offline'
    }
    if (entry.approval_needed) {
      return 'pending'
    }
    const snapshotTimeMs = Date.now() - entry.snapshot_age_ms
    return snapshotTimeMs > meta.detected_at * 1000 ? 'resolved' : 'pending'
  }, [meta, runtimes.data])

  if (!meta) {
    return <div className="text-ui-sm text-ink-3">{message.text}</div>
  }

  const actionable = status === 'pending'
  const send = (keys: string) => {
    if (actionable) {
      input.mutate(keys)
    }
  }
  const sendFromMenu = (keys: string) => {
    send(keys)
    setKeysOpen(false)
  }

  return (
    <div
      className="my-1 w-full max-w-md rounded-card border border-border bg-surface-raised px-2.5 py-2 text-ui-sm"
      data-testid="chat-approval-card"
    >
      <div className="flex items-center gap-2">
        {status === 'resolved' ? (
          <IconCheck aria-hidden className="size-3.5 shrink-0 text-success" />
        ) : (
          <span
            aria-hidden
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              status === 'pending' ? 'bg-warning' : 'bg-ink-4',
            )}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium text-ink-1">
          {meta.reason === 'stuck'
            ? `${meta.agent} looks stuck`
            : `${meta.agent} needs approval`}
        </span>
        {status !== 'pending' ? (
          <span className="shrink-0 text-ui-2xs text-ink-3">{status}</span>
        ) : null}
      </div>

      {meta.hint ? (
        <p
          className="mt-1 truncate font-mono text-ui-2xs text-ink-3"
          title={meta.hint}
        >
          {meta.hint}
        </p>
      ) : null}

      <div className="mt-2 flex items-center gap-1.5">
        <Button className="h-7 px-3" disabled={!actionable} onClick={() => send('1')} size="sm">
          Approve
        </Button>
        <Popover onOpenChange={setKeysOpen} open={keysOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="More keys"
              className="h-7 gap-1 px-2 text-ink-3"
              disabled={!actionable}
              size="sm"
              variant="ghost"
            >
              <IconDots className="size-4" />
              keys
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="flex items-center gap-1.5">
              <Button className="h-7 flex-1" onClick={() => sendFromMenu('2')} size="sm" variant="outline">
                2
              </Button>
              <Button className="h-7 flex-1" onClick={() => sendFromMenu('y')} size="sm" variant="outline">
                y
              </Button>
              <Button
                aria-label="Send Enter"
                className="h-7 flex-1"
                onClick={() => sendFromMenu('')}
                size="sm"
                variant="outline"
              >
                <IconCornerDownLeft className="size-4" />
              </Button>
            </div>
            <Input
              className="mt-1.5 h-7"
              onChange={(event) => setCustomKeys(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && customKeys) {
                  sendFromMenu(customKeys)
                  setCustomKeys('')
                }
              }}
              placeholder="custom keys, Enter to send"
              value={customKeys}
            />
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={setScreenOpen} open={screenOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label="View screen"
              className="size-7 text-ink-3"
              size="icon"
              variant="ghost"
            >
              <IconEye className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[32rem] max-w-[90vw] p-0">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-divider bg-surface-sunken p-2 font-mono text-ui-2xs leading-snug text-ink-1">
              {snapshot.data?.snapshot?.text ?? 'No snapshot available.'}
            </pre>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
