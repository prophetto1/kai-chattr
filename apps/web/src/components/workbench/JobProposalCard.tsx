import { useMemo, useState } from 'react'

import {
  IconBriefcase,
  IconCheck,
  IconMessageCircle,
  IconX,
} from '@tabler/icons-react'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import type { ChattrRoomMessage } from '@/hooks/use-chattr-room'
import { cn } from '@/lib/cn'
import { typographyStyle } from '@/lib/design-system'
import { createJob, demoteJobProposal } from '@/lib/jobs-api'

type JobProposalMeta = {
  body: string
  status: 'pending' | 'accepted' | 'dismissed' | string
  title: string
}

function parseJobProposalMeta(message: ChattrRoomMessage): JobProposalMeta | null {
  const meta = message.metadata
  if (!meta) {
    return null
  }

  const title = typeof meta.title === 'string' ? meta.title.trim() : ''
  if (!title) {
    return null
  }

  return {
    body: typeof meta.body === 'string' ? meta.body.trim() : '',
    status: typeof meta.status === 'string' ? meta.status : 'pending',
    title,
  }
}

export function JobProposalCard({
  message,
  onAccepted,
  onRequestChanges,
}: {
  message: ChattrRoomMessage
  onAccepted?: (jobId: number) => void
  onRequestChanges?: () => void
}) {
  const meta = useMemo(() => parseJobProposalMeta(message), [message])
  const [localStatus, setLocalStatus] = useState<'pending' | 'accepted' | 'dismissed'>('pending')
  const [error, setError] = useState('')
  const [busyAction, setBusyAction] = useState<'accept' | 'dismiss' | 'changes' | ''>('')

  if (!meta) {
    return (
      <div className="text-muted-foreground" style={typographyStyle('ui.caption')}>
        {message.text}
      </div>
    )
  }

  const status = localStatus !== 'pending' ? localStatus : meta.status
  const resolved = status !== 'pending'
  const messageId = message.id
  const anchorMessageId =
    typeof messageId === 'number' ? messageId : Number.parseInt(String(messageId ?? ''), 10)
  const canResolve = messageId !== undefined && !resolved && !busyAction

  const accept = async () => {
    if (!canResolve) {
      return
    }
    setBusyAction('accept')
    setError('')
    try {
      const created = await createJob({
        ...(Number.isFinite(anchorMessageId) ? { anchor_msg_id: anchorMessageId } : {}),
        body: meta.body,
        channel: message.channel ?? 'general',
        created_by: message.sender || 'user',
        title: meta.title,
      })
      setLocalStatus('accepted')
      onAccepted?.(created.id)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Failed to accept job proposal')
    } finally {
      setBusyAction('')
    }
  }

  const demote = async (action: 'dismiss' | 'changes') => {
    if (!canResolve) {
      return
    }
    setBusyAction(action)
    setError('')
    try {
      await demoteJobProposal(messageId)
      setLocalStatus(action === 'dismiss' ? 'dismissed' : 'pending')
      if (action === 'changes') {
        onRequestChanges?.()
      }
    } catch (demoteError) {
      setError(demoteError instanceof Error ? demoteError.message : 'Failed to update job proposal')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <div
      className={cn(
        'my-1 w-full max-w-lg rounded-md border border-border bg-card px-3 py-2.5 text-foreground shadow-sm',
        resolved && 'border-border/70 bg-muted/25'
      )}
      data-testid="job-proposal-card"
    >
      <div className="flex min-w-0 items-center gap-2">
        {status === 'accepted' ? (
          <IconCheck aria-hidden className="size-4 shrink-0 text-emerald-500" />
        ) : (
          <IconBriefcase aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-muted-foreground"
              style={typographyStyle('ui.overline')}
            >
              Job Proposal
            </span>
            <span className="min-w-0 truncate text-muted-foreground" style={typographyStyle('ui.caption')}>
              {message.sender}
            </span>
          </div>
          <h3 className="mt-1 truncate text-foreground" style={typographyStyle('ui.body-strong')}>
            {meta.title}
          </h3>
        </div>
        {resolved ? (
          <span className="shrink-0 capitalize text-muted-foreground" style={typographyStyle('ui.caption')}>
            {status}
          </span>
        ) : null}
      </div>

      {meta.body ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-muted-foreground" style={typographyStyle('ui.body')}>
          {meta.body}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-destructive" style={typographyStyle('ui.caption')}>
          {error}
        </p>
      ) : null}

      {!resolved ? (
        <ButtonGroup className="mt-2">
          <Button
            className="h-7 px-3"
            disabled={!canResolve}
            onClick={() => void accept()}
            size="sm"
            type="button"
          >
            Accept
          </Button>
          <Button
            className="h-7 px-2"
            disabled={!canResolve}
            onClick={() => void demote('changes')}
            size="sm"
            type="button"
            variant="outline"
          >
            <IconMessageCircle className="size-3.5" />
            Changes
          </Button>
          <Button
            aria-label="Dismiss job proposal"
            className="size-7"
            disabled={!canResolve}
            onClick={() => void demote('dismiss')}
            size="icon"
            type="button"
            variant="ghost"
          >
            <IconX className="size-3.5" />
          </Button>
        </ButtonGroup>
      ) : null}
    </div>
  )
}
