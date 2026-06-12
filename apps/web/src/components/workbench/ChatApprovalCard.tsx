import { useMemo, useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownToLine, Check, CircleAlert, Eye } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
    return <div className="text-sm text-muted-foreground">{message.text}</div>
  }

  const actionable = status === 'pending'
  const send = (keys: string) => {
    if (actionable) {
      input.mutate(keys)
    }
  }

  return (
    <div
      className="my-1 w-full max-w-xl rounded-lg border border-amber-500/40 bg-amber-500/5 p-3"
      data-testid="chat-approval-card"
    >
      <div className="flex items-center gap-2">
        {status === 'resolved' ? (
          <Check aria-hidden className="size-4 text-emerald-500" />
        ) : (
          <CircleAlert aria-hidden className="size-4 text-amber-500" />
        )}
        <span className="text-sm font-medium">
          {meta.reason === 'stuck'
            ? `${meta.agent} looks stuck`
            : `${meta.agent} is asking for approval`}
        </span>
        <Badge variant={status === 'resolved' ? 'secondary' : 'outline'}>
          {status}
        </Badge>
      </div>
      {meta.hint ? (
        <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
          {meta.hint}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={!actionable} onClick={() => send('1')} size="sm">
          Approve
        </Button>
        <Button disabled={!actionable} onClick={() => send('2')} size="sm" variant="outline">
          2
        </Button>
        <Button disabled={!actionable} onClick={() => send('y')} size="sm" variant="outline">
          y
        </Button>
        <Button
          aria-label="Send Enter"
          disabled={!actionable}
          onClick={() => send('')}
          size="sm"
          variant="outline"
        >
          <ArrowDownToLine className="size-4" />
        </Button>
        <Input
          className="h-8 w-28"
          disabled={!actionable}
          onChange={(event) => setCustomKeys(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && customKeys) {
              send(customKeys)
              setCustomKeys('')
            }
          }}
          placeholder="keys"
          value={customKeys}
        />
        <Popover onOpenChange={setScreenOpen} open={screenOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost">
              <Eye className="mr-1 size-4" />
              View screen
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[36rem] max-w-[90vw]">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 font-mono text-[11px] leading-snug text-zinc-100">
              {snapshot.data?.snapshot?.text ?? 'No snapshot available.'}
            </pre>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
