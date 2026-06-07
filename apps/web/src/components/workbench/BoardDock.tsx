'use client'

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  IconArchive,
  IconCheck,
  IconEdit,
  IconTrash,
  IconX,
} from '@tabler/icons-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BoardDropZone } from '@/components/workbench/board/BoardDropZone'
import { BoardItemRow } from '@/components/workbench/board/BoardItemRow'
import { BoardSection } from '@/components/workbench/board/BoardSection'
import {
  type BoardTabId,
  type CapabilityTab,
  type JobItem,
  type JobLaneId,
  type LockedItem,
  type LockedLaneId,
  type PinItem,
  type PinLaneId,
  type RuleItem,
  type RuleLaneId,
  boardTabs,
  isBoardTabId,
  normalizeJobStatus,
  normalizeLockedStatus,
  normalizePinStatus,
  normalizeRuleStatus,
} from '@/components/workbench/board/types'
import { chattrJson, errorMessage } from '@/lib/chattr-api'
import { cn } from '@/lib/cn'

type DragRecord =
  | { type: 'rule'; id: number; status: RuleLaneId }
  | { type: 'job'; id: number; status: JobLaneId }

const ruleLanes: Array<{ id: RuleLaneId; label: string; description: string }> = [
  { id: 'draft', label: 'Drafts', description: 'proposed and inactive rules' },
  { id: 'active', label: 'Active', description: 'injected into agent context' },
  { id: 'archived', label: 'Archive', description: 'retained but inactive' },
]

const jobLanes: Array<{ id: JobLaneId; label: string; description: string }> = [
  { id: 'open', label: 'Open', description: 'ready for work' },
  { id: 'done', label: 'Done', description: 'completed work threads' },
  { id: 'archived', label: 'Closed', description: 'archived threads' },
]

const lockedLanes: Array<{ id: LockedLaneId; label: string; description: string }> = [
  { id: 'active', label: 'Locked', description: 'current constraints' },
  { id: 'archived', label: 'Archive', description: 'inactive constraints' },
]

const pinLanes: Array<{ id: PinLaneId; label: string; description: string }> = [
  { id: 'todo', label: 'Todo', description: 'pinned follow-ups' },
  { id: 'done', label: 'Done', description: 'completed pins' },
]

function statusBadgeClass(status: string) {
  if (status === 'active' || status === 'open' || status === 'todo') {
    return 'bg-emerald-600 text-white'
  }
  if (status === 'done' || status === 'draft') {
    return 'bg-sky-600 text-white'
  }
  if (status === 'archived') {
    return 'bg-muted text-muted-foreground'
  }
  return ''
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function BoardForm({ children, onSubmit }: { children: ReactNode; onSubmit?: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form
      className="rounded-md border border-border/70 bg-background p-2"
      onSubmit={onSubmit}
    >
      {children}
    </form>
  )
}

function sortJobs(items: JobItem[]) {
  return [...items].sort((a, b) => {
    const aOrder = Number(a.sort_order ?? 0)
    const bOrder = Number(b.sort_order ?? 0)
    if (aOrder !== bOrder) {
      return bOrder - aOrder
    }
    const aUpdated = Number(a.updated_at ?? 0)
    const bUpdated = Number(b.updated_at ?? 0)
    if (aUpdated !== bUpdated) {
      return bUpdated - aUpdated
    }
    return b.id - a.id
  })
}

function groupByStatus<T, S extends string>(
  items: T[],
  statuses: readonly S[],
  normalize: (item: T) => S
) {
  const grouped = {} as Record<S, T[]>
  for (const status of statuses) {
    grouped[status] = []
  }
  for (const item of items) {
    grouped[normalize(item)].push(item)
  }
  return grouped
}

function RuleRow({
  deleting,
  editing,
  onDelete,
  onEdit,
  onEditChange,
  onSaveEdit,
  onStatus,
  rule,
  saving,
}: {
  deleting: boolean
  editing: { id: number; text: string; reason: string } | null
  onDelete: (ruleId: number) => void
  onEdit: (rule: RuleItem) => void
  onEditChange: (value: { id: number; text: string; reason: string } | null) => void
  onSaveEdit: (ruleId: number, value: { text: string; reason: string }) => void
  onStatus: (ruleId: number, status: RuleLaneId) => void
  rule: RuleItem
  saving: boolean
}) {
  const status = normalizeRuleStatus(rule.status)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    data: { id: rule.id, status, type: 'rule' } satisfies DragRecord,
    id: `rule:${rule.id}`,
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const activeEdit = editing?.id === rule.id ? editing : null

  return (
    <BoardItemRow
      actions={
        <ButtonGroup>
          {activeEdit ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="size-7"
                    disabled={saving || !activeEdit.text.trim()}
                    onClick={() => onSaveEdit(rule.id, activeEdit)}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <IconCheck className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save rule</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="size-7"
                    onClick={() => onEditChange(null)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <IconX className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel edit</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-7"
                  onClick={() => onEdit(rule)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <IconEdit className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit rule</TooltipContent>
            </Tooltip>
          )}
          {status !== 'active' ? (
            <Button
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => onStatus(rule.id, 'active')}
              size="sm"
              type="button"
              variant="outline"
            >
              Active
            </Button>
          ) : null}
          {status !== 'draft' ? (
            <Button
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => onStatus(rule.id, 'draft')}
              size="sm"
              type="button"
              variant="outline"
            >
              Draft
            </Button>
          ) : null}
          {status !== 'archived' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-7"
                  disabled={saving}
                  onClick={() => onStatus(rule.id, 'archived')}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <IconArchive className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Archive rule</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-7"
                disabled={saving || deleting}
                onClick={() => onDelete(rule.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconTrash className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete rule</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      }
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      meta={
        <>
          #{rule.id}
          {rule.author ? ` by ${rule.author}` : ''}
        </>
      }
      ref={setNodeRef}
      status={status}
      statusClassName={statusBadgeClass(status)}
      style={style}
      title={
        activeEdit ? (
          <div className="space-y-1.5">
            <Textarea
              className="min-h-16 resize-none text-sm"
              onChange={(event) => onEditChange({ ...activeEdit, text: event.target.value })}
              value={activeEdit.text}
            />
            <Input
              className="h-8 text-xs"
              onChange={(event) => onEditChange({ ...activeEdit, reason: event.target.value })}
              placeholder="Reason"
              value={activeEdit.reason}
            />
          </div>
        ) : (
          <span>{rule.text}</span>
        )
      }
    >
      {!activeEdit && rule.reason ? (
        <p className="text-xs leading-5 text-muted-foreground">{rule.reason}</p>
      ) : null}
    </BoardItemRow>
  )
}

function JobRow({
  job,
  onDelete,
  onDraftChange,
  onMessage,
  onMessageChange,
  onSave,
  onStatus,
  saving,
  draft,
  messageDraft,
}: {
  draft: { title: string; assignee: string }
  job: JobItem
  messageDraft: string
  onDelete: (jobId: number) => void
  onDraftChange: (jobId: number, value: { title: string; assignee: string }) => void
  onMessage: (jobId: number) => void
  onMessageChange: (jobId: number, value: string) => void
  onSave: (jobId: number, value: { title: string; assignee: string }) => void
  onStatus: (jobId: number, status: JobLaneId) => void
  saving: boolean
}) {
  const status = normalizeJobStatus(job.status)
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    data: { id: job.id, status, type: 'job' } satisfies DragRecord,
    id: `job:${job.id}`,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const visibleMessages = (job.messages ?? []).filter((message) => !message.deleted)

  return (
    <BoardItemRow
      actions={
        <ButtonGroup>
          <Button
            className="h-7 px-2 text-xs"
            disabled={saving || !draft.title.trim()}
            onClick={() => onSave(job.id, draft)}
            size="sm"
            type="button"
            variant="outline"
          >
            Save
          </Button>
          {jobLanes.map((lane) => (
            <Button
              className="h-7 px-2 text-xs"
              disabled={saving || status === lane.id}
              key={lane.id}
              onClick={() => onStatus(job.id, lane.id)}
              size="sm"
              type="button"
              variant="outline"
            >
              {lane.label}
            </Button>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="size-7"
                disabled={saving}
                onClick={() => onDelete(job.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <IconTrash className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete job</TooltipContent>
          </Tooltip>
        </ButtonGroup>
      }
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      meta={
        <>
          #{job.id} {job.channel ?? 'general'} / {visibleMessages.length} messages
        </>
      }
      ref={setNodeRef}
      status={status}
      statusClassName={statusBadgeClass(status)}
      style={style}
      title={
        <div className="space-y-1.5">
          <Input
            className="h-8 text-sm font-medium"
            onChange={(event) => onDraftChange(job.id, { ...draft, title: event.target.value })}
            value={draft.title}
          />
          <Input
            className="h-8 text-xs"
            onChange={(event) =>
              onDraftChange(job.id, { ...draft, assignee: event.target.value })
            }
            placeholder="Assignee"
            value={draft.assignee}
          />
        </div>
      }
    >
      {job.body ? <p className="text-xs leading-5 text-muted-foreground">{job.body}</p> : null}
      {visibleMessages.length > 0 ? (
        <div className="space-y-1 border-t border-border/60 pt-1.5">
          {visibleMessages.slice(-3).map((message) => (
            <p className="text-xs text-muted-foreground" key={message.id}>
              <span className="font-medium text-foreground">{message.sender ?? 'user'}:</span>{' '}
              {message.text}
            </p>
          ))}
        </div>
      ) : null}
      <ButtonGroup className="w-full">
        <Input
          className="h-8 text-xs"
          onChange={(event) => onMessageChange(job.id, event.target.value)}
          placeholder="Add thread message"
          value={messageDraft}
        />
        <Button
          className="h-8 px-2 text-xs"
          disabled={saving || !messageDraft.trim()}
          onClick={() => onMessage(job.id)}
          size="sm"
          type="button"
          variant="outline"
        >
          Send
        </Button>
      </ButtonGroup>
    </BoardItemRow>
  )
}

export function BoardDock() {
  const [activeTab, setActiveTab] = useState<BoardTabId>('rules')
  const [capabilities, setCapabilities] = useState<CapabilityTab[] | null>(null)
  const [rules, setRules] = useState<RuleItem[]>([])
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [locked, setLocked] = useState<LockedItem[]>([])
  const [pins, setPins] = useState<PinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [ruleDraft, setRuleDraft] = useState({ text: '', reason: '' })
  const [editingRule, setEditingRule] = useState<{ id: number; text: string; reason: string } | null>(
    null
  )
  const [jobDraft, setJobDraft] = useState({ title: '', body: '', assignee: '' })
  const [jobEdits, setJobEdits] = useState<Record<number, { title: string; assignee: string }>>({})
  const [jobMessages, setJobMessages] = useState<Record<number, string>>({})
  const [lockedDraft, setLockedDraft] = useState({ text: '', reason: '' })
  const [lockedEdits, setLockedEdits] = useState<Record<number, { text: string; reason: string }>>({})
  const [pinMessageId, setPinMessageId] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const availableTabs = useMemo(() => {
    if (capabilities === null) {
      return boardTabs
    }

    const allowed = new Set(capabilities.map((tab) => tab.id))
    return boardTabs.filter((tab) => allowed.has(tab.id))
  }, [capabilities])

  const isTabAvailable = useCallback(
    (tabId: BoardTabId) => availableTabs.some((tab) => tab.id === tabId),
    [availableTabs]
  )

  const groupedRules = useMemo(
    () => groupByStatus(rules, ['draft', 'active', 'archived'] as const, (rule) => normalizeRuleStatus(rule.status)),
    [rules]
  )
  const groupedJobs = useMemo(() => {
    const grouped = groupByStatus(
      jobs,
      ['open', 'done', 'archived'] as const,
      (job) => normalizeJobStatus(job.status)
    )
    return {
      archived: sortJobs(grouped.archived),
      done: sortJobs(grouped.done),
      open: sortJobs(grouped.open),
    }
  }, [jobs])
  const groupedLocked = useMemo(
    () =>
      groupByStatus(locked, ['active', 'archived'] as const, (item) =>
        normalizeLockedStatus(item.status)
      ),
    [locked]
  )
  const groupedPins = useMemo(
    () => groupByStatus(pins, ['todo', 'done'] as const, (pin) => normalizePinStatus(pin.status)),
    [pins]
  )

  const counts: Record<BoardTabId, number> = useMemo(
    () => ({
      rules: groupedRules.active.length,
      jobs: groupedJobs.open.length + groupedJobs.done.length,
      locked: groupedLocked.active.length,
      pins: groupedPins.todo.length,
    }),
    [groupedJobs, groupedLocked, groupedPins, groupedRules]
  )

  const loadBoard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const capabilityResponse = await chattrJson<{ tabs: CapabilityTab[] }>(
        '/api/right-rail/capabilities'
      )
      const nextCapabilities = capabilityResponse.tabs.filter((tab) => isBoardTabId(tab.id))
      setCapabilities(nextCapabilities)

      const allowed = new Set(nextCapabilities.map((tab) => tab.id))
      const [nextRules, nextJobs, nextLocked, nextPins] = await Promise.all([
        allowed.has('rules') ? chattrJson<RuleItem[]>('/api/rules') : Promise.resolve([]),
        allowed.has('jobs') ? chattrJson<JobItem[]>('/api/jobs') : Promise.resolve([]),
        allowed.has('locked') ? chattrJson<LockedItem[]>('/api/locked') : Promise.resolve([]),
        allowed.has('pins') ? chattrJson<PinItem[]>('/api/pins') : Promise.resolve([]),
      ])

      setRules(nextRules)
      setJobs(nextJobs)
      setLocked(nextLocked)
      setPins(nextPins)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBoard()
  }, [loadBoard])

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(availableTabs[0].id)
    }
  }, [activeTab, availableTabs])

  const withSave = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setSaving(key)
      setError('')
      try {
        await action()
        await loadBoard()
      } catch (saveError) {
        setError(errorMessage(saveError))
      } finally {
        setSaving('')
      }
    },
    [loadBoard]
  )

  const createRule = useCallback(
    async (status: RuleLaneId) => {
      const text = ruleDraft.text.trim()
      if (!text) {
        return
      }
      await withSave(`create-rule-${status}`, async () => {
        await chattrJson<RuleItem>('/api/rules', {
          body: JSON.stringify({ ...ruleDraft, status }),
          method: 'POST',
        })
        setRuleDraft({ text: '', reason: '' })
      })
    },
    [ruleDraft, withSave]
  )

  const updateRule = useCallback(
    async (ruleId: number, body: Record<string, unknown>, key = `rule-${ruleId}`) => {
      await withSave(key, async () => {
        await chattrJson<RuleItem>(`/api/rules/${ruleId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
        setEditingRule(null)
      })
    },
    [withSave]
  )

  const setRuleStatus = useCallback(
    (ruleId: number, status: RuleLaneId) => {
      const action = status === 'archived' ? 'archive' : status === 'active' ? 'activate' : 'draft'
      void updateRule(ruleId, { action }, `rule-${ruleId}-${status}`)
    },
    [updateRule]
  )

  const deleteRule = useCallback(
    async (ruleId: number) => {
      await withSave(`delete-rule-${ruleId}`, async () => {
        await chattrJson(`/api/rules/${ruleId}`, { method: 'DELETE' })
      })
    },
    [withSave]
  )

  const createJob = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const title = jobDraft.title.trim()
      if (!title) {
        return
      }
      await withSave('create-job', async () => {
        await chattrJson<JobItem>('/api/jobs', {
          body: JSON.stringify({
            assignee: jobDraft.assignee,
            body: jobDraft.body,
            created_by: 'user',
            title,
          }),
          method: 'POST',
        })
        setJobDraft({ title: '', body: '', assignee: '' })
      })
    },
    [jobDraft, withSave]
  )

  const updateJob = useCallback(
    async (jobId: number, body: Record<string, unknown>, key = `job-${jobId}`) => {
      await withSave(key, async () => {
        await chattrJson<JobItem>(`/api/jobs/${jobId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const setJobEdit = useCallback((jobId: number, value: { title: string; assignee: string }) => {
    setJobEdits((current) => ({ ...current, [jobId]: value }))
  }, [])

  const saveJobEdit = useCallback(
    (jobId: number, value: { title: string; assignee: string }) => {
      void updateJob(jobId, value, `job-${jobId}-edit`)
    },
    [updateJob]
  )

  const deleteJob = useCallback(
    async (jobId: number) => {
      await withSave(`delete-job-${jobId}`, async () => {
        await chattrJson(`/api/jobs/${jobId}?permanent=true`, { method: 'DELETE' })
      })
    },
    [withSave]
  )

  const reorderJobs = useCallback(
    async (status: JobLaneId, orderedIds: number[]) => {
      await withSave(`reorder-jobs-${status}`, async () => {
        await chattrJson('/api/jobs/reorder', {
          body: JSON.stringify({ ordered_ids: orderedIds, status }),
          method: 'POST',
        })
      })
    },
    [withSave]
  )

  const addJobMessage = useCallback(
    async (jobId: number) => {
      const text = (jobMessages[jobId] ?? '').trim()
      if (!text) {
        return
      }
      await withSave(`job-message-${jobId}`, async () => {
        await chattrJson(`/api/jobs/${jobId}/messages`, {
          body: JSON.stringify({ sender: 'user', text }),
          method: 'POST',
        })
        setJobMessages((current) => ({ ...current, [jobId]: '' }))
      })
    },
    [jobMessages, withSave]
  )

  const createLocked = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const text = lockedDraft.text.trim()
      if (!text) {
        return
      }
      await withSave('create-locked', async () => {
        await chattrJson<LockedItem>('/api/locked', {
          body: JSON.stringify({ ...lockedDraft, sender: 'user' }),
          method: 'POST',
        })
        setLockedDraft({ text: '', reason: '' })
      })
    },
    [lockedDraft, withSave]
  )

  const updateLocked = useCallback(
    async (lockedId: number, body: Record<string, unknown>, key = `locked-${lockedId}`) => {
      await withSave(key, async () => {
        await chattrJson<LockedItem>(`/api/locked/${lockedId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const deleteLocked = useCallback(
    async (lockedId: number) => {
      await withSave(`delete-locked-${lockedId}`, async () => {
        await chattrJson(`/api/locked/${lockedId}`, { method: 'DELETE' })
      })
    },
    [withSave]
  )

  const createPin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const messageId = Number.parseInt(pinMessageId, 10)
      if (!Number.isFinite(messageId)) {
        return
      }
      await withSave('create-pin', async () => {
        await chattrJson<PinItem>('/api/pins', {
          body: JSON.stringify({ message_id: messageId }),
          method: 'POST',
        })
        setPinMessageId('')
      })
    },
    [pinMessageId, withSave]
  )

  const updatePin = useCallback(
    async (messageId: number, action: 'done' | 'reopen' | 'remove') => {
      await withSave(`pin-${messageId}-${action}`, async () => {
        await chattrJson(`/api/pins/${messageId}`, {
          body: JSON.stringify({ action }),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const clearPins = useCallback(async () => {
    await withSave('clear-pins', async () => {
      await chattrJson('/api/pins', { method: 'DELETE' })
    })
  }, [withSave])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current as DragRecord | undefined
      if (!activeData || !event.over) {
        return
      }

      const overId = String(event.over.id)
      const overData = event.over.data.current as DragRecord | undefined

      if (activeData.type === 'rule') {
        if (overId === 'rules:delete') {
          if (activeData.status === 'archived') {
            void deleteRule(activeData.id)
          } else {
            setRuleStatus(activeData.id, 'archived')
          }
          return
        }

        const status = overId.startsWith('rules:')
          ? (overId.slice('rules:'.length) as RuleLaneId)
          : overData?.type === 'rule'
            ? overData.status
            : null
        if (status && status !== activeData.status) {
          setRuleStatus(activeData.id, status)
        }
        return
      }

      if (activeData.type === 'job') {
        if (overId === 'jobs:delete') {
          if (activeData.status === 'archived') {
            void deleteJob(activeData.id)
          } else {
            void updateJob(activeData.id, { status: 'archived' }, `job-${activeData.id}-archived`)
          }
          return
        }

        const targetStatus = overId.startsWith('jobs:')
          ? (overId.slice('jobs:'.length) as JobLaneId)
          : overData?.type === 'job'
            ? overData.status
            : null
        if (!targetStatus) {
          return
        }

        if (targetStatus !== activeData.status) {
          void updateJob(activeData.id, { status: targetStatus }, `job-${activeData.id}-${targetStatus}`)
          return
        }

        if (overData?.type === 'job' && overData.id !== activeData.id) {
          const lane = groupedJobs[targetStatus]
          const oldIndex = lane.findIndex((job) => job.id === activeData.id)
          const newIndex = lane.findIndex((job) => job.id === overData.id)
          if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
            const next = arrayMove(lane, oldIndex, newIndex).map((job) => job.id)
            void reorderJobs(targetStatus, next)
          }
        }
      }
    },
    [deleteJob, deleteRule, groupedJobs, reorderJobs, setRuleStatus, updateJob]
  )

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd} sensors={sensors}>
      <section className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-card">
        <Tabs
          className="h-full min-h-0 w-full min-w-0 max-w-full gap-0 overflow-hidden bg-card"
          onValueChange={(value) => {
            if (isBoardTabId(value)) {
              setActiveTab(value)
            }
          }}
          value={activeTab}
        >
          <div className="w-full min-w-0 shrink-0 overflow-hidden border-b border-border">
            <TabsList
              variant="line"
              className="flex h-10 w-full min-w-0 max-w-full items-stretch justify-start rounded-none bg-card p-0"
            >
              {availableTabs.map((tab) => (
                <TabsTrigger
                  className="h-10 min-w-0 flex-1 basis-0 overflow-hidden rounded-none px-1.5 text-xs"
                  disabled={loading}
                  key={tab.id}
                  value={tab.id}
                >
                  <span className="min-w-0 truncate">{tab.label}</span>
                  <Badge variant="secondary" className="h-4 min-w-4 shrink-0 px-1 text-[10px] tabular-nums">
                    {counts[tab.id]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {error ? (
            <Alert variant="destructive" className="m-3 mb-0 rounded-md">
              <AlertTitle>Board API error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {availableTabs.length === 0 ? (
            <div className="p-3">
              <EmptyState>No Board tabs are available.</EmptyState>
            </div>
          ) : null}

          {isTabAvailable('rules') ? (
            <TabsContent value="rules" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <BoardForm>
                    <Textarea
                      className="min-h-20 resize-none text-sm"
                      onChange={(event) =>
                        setRuleDraft((current) => ({ ...current, text: event.target.value }))
                      }
                      placeholder="Rule text"
                      value={ruleDraft.text}
                    />
                    <Input
                      className="mt-2 h-8 text-xs"
                      onChange={(event) =>
                        setRuleDraft((current) => ({ ...current, reason: event.target.value }))
                      }
                      placeholder="Reason"
                      value={ruleDraft.reason}
                    />
                    <ButtonGroup className="mt-2 ml-auto">
                      <Button
                        className="h-7 px-2 text-xs"
                        disabled={!ruleDraft.text.trim() || Boolean(saving)}
                        onClick={() => void createRule('draft')}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Save Draft
                      </Button>
                      <Button
                        className="h-7 px-2 text-xs"
                        disabled={!ruleDraft.text.trim() || Boolean(saving)}
                        onClick={() => void createRule('active')}
                        size="sm"
                        type="button"
                      >
                        Activate
                      </Button>
                    </ButtonGroup>
                  </BoardForm>

                  {rules.length === 0 ? <EmptyState>{boardTabs[0].empty}</EmptyState> : null}
                  {ruleLanes.map((lane) => (
                    <BoardDropZone id={`rules:${lane.id}`} key={lane.id}>
                      <BoardSection
                        count={groupedRules[lane.id].length}
                        defaultOpen={lane.id !== 'archived'}
                        description={lane.description}
                        title={lane.label}
                      >
                        {groupedRules[lane.id].length === 0 ? (
                          <EmptyState>No {lane.label.toLowerCase()}.</EmptyState>
                        ) : null}
                        {groupedRules[lane.id].map((rule) => (
                          <RuleRow
                            deleting={saving === `delete-rule-${rule.id}`}
                            editing={editingRule}
                            key={rule.id}
                            onDelete={(ruleId) => void deleteRule(ruleId)}
                            onEdit={(nextRule) =>
                              setEditingRule({
                                id: nextRule.id,
                                reason: nextRule.reason ?? '',
                                text: nextRule.text,
                              })
                            }
                            onEditChange={setEditingRule}
                            onSaveEdit={(ruleId, value) =>
                              void updateRule(ruleId, {
                                reason: value.reason,
                                text: value.text,
                              })
                            }
                            onStatus={setRuleStatus}
                            rule={rule}
                            saving={Boolean(saving)}
                          />
                        ))}
                      </BoardSection>
                    </BoardDropZone>
                  ))}
                  <BoardDropZone id="rules:delete">
                    <div className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-destructive/50 bg-destructive/5 px-3 text-xs text-destructive">
                      <IconTrash className="size-3.5" />
                      Drop archived rules here to delete; other rules archive first.
                    </div>
                  </BoardDropZone>
                </div>
              </ScrollArea>
            </TabsContent>
          ) : null}

          {isTabAvailable('jobs') ? (
            <TabsContent value="jobs" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <BoardForm onSubmit={(event) => void createJob(event)}>
                    <Input
                      className="h-8 text-xs"
                      onChange={(event) =>
                        setJobDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Job title"
                      value={jobDraft.title}
                    />
                    <Textarea
                      className="mt-2 min-h-20 resize-none text-sm"
                      onChange={(event) =>
                        setJobDraft((current) => ({ ...current, body: event.target.value }))
                      }
                      placeholder="Body"
                      value={jobDraft.body}
                    />
                    <ButtonGroup className="mt-2 w-full">
                      <Input
                        className="h-8 text-xs"
                        onChange={(event) =>
                          setJobDraft((current) => ({ ...current, assignee: event.target.value }))
                        }
                        placeholder="Assignee"
                        value={jobDraft.assignee}
                      />
                      <Button
                        className="h-8 px-3 text-xs"
                        disabled={!jobDraft.title.trim() || Boolean(saving)}
                        size="sm"
                        type="submit"
                      >
                        Create
                      </Button>
                    </ButtonGroup>
                  </BoardForm>

                  {jobs.length === 0 ? <EmptyState>{boardTabs[1].empty}</EmptyState> : null}
                  {jobLanes.map((lane) => {
                    const items = groupedJobs[lane.id]
                    return (
                      <BoardDropZone id={`jobs:${lane.id}`} key={lane.id}>
                        <BoardSection
                          count={items.length}
                          defaultOpen={lane.id !== 'archived'}
                          description={lane.description}
                          title={lane.label}
                        >
                          {items.length === 0 ? (
                            <EmptyState>No {lane.label.toLowerCase()} jobs.</EmptyState>
                          ) : null}
                          <SortableContext
                            items={items.map((job) => `job:${job.id}`)}
                            strategy={verticalListSortingStrategy}
                          >
                            {items.map((job) => {
                              const edit = jobEdits[job.id] ?? {
                                assignee: job.assignee ?? '',
                                title: job.title,
                              }
                              return (
                                <JobRow
                                  draft={edit}
                                  job={job}
                                  key={job.id}
                                  messageDraft={jobMessages[job.id] ?? ''}
                                  onDelete={(jobId) => void deleteJob(jobId)}
                                  onDraftChange={setJobEdit}
                                  onMessage={(jobId) => void addJobMessage(jobId)}
                                  onMessageChange={(jobId, value) =>
                                    setJobMessages((current) => ({ ...current, [jobId]: value }))
                                  }
                                  onSave={saveJobEdit}
                                  onStatus={(jobId, status) =>
                                    void updateJob(jobId, { status }, `job-${jobId}-${status}`)
                                  }
                                  saving={Boolean(saving)}
                                />
                              )
                            })}
                          </SortableContext>
                        </BoardSection>
                      </BoardDropZone>
                    )
                  })}
                  <BoardDropZone id="jobs:delete">
                    <div className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-dashed border-destructive/50 bg-destructive/5 px-3 text-xs text-destructive">
                      <IconTrash className="size-3.5" />
                      Drop closed jobs here to delete; other jobs close first.
                    </div>
                  </BoardDropZone>
                </div>
              </ScrollArea>
            </TabsContent>
          ) : null}

          {isTabAvailable('locked') ? (
            <TabsContent value="locked" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <BoardForm onSubmit={(event) => void createLocked(event)}>
                    <Textarea
                      className="min-h-20 resize-none text-sm"
                      onChange={(event) =>
                        setLockedDraft((current) => ({ ...current, text: event.target.value }))
                      }
                      placeholder="Locked coordination record"
                      value={lockedDraft.text}
                    />
                    <ButtonGroup className="mt-2 w-full">
                      <Input
                        className="h-8 text-xs"
                        onChange={(event) =>
                          setLockedDraft((current) => ({ ...current, reason: event.target.value }))
                        }
                        placeholder="Reason"
                        value={lockedDraft.reason}
                      />
                      <Button
                        className="h-8 px-3 text-xs"
                        disabled={!lockedDraft.text.trim() || Boolean(saving)}
                        size="sm"
                        type="submit"
                      >
                        Lock
                      </Button>
                    </ButtonGroup>
                  </BoardForm>

                  {locked.length === 0 ? <EmptyState>{boardTabs[2].empty}</EmptyState> : null}
                  {lockedLanes.map((lane) => (
                    <BoardSection
                      count={groupedLocked[lane.id].length}
                      defaultOpen={lane.id !== 'archived'}
                      description={lane.description}
                      key={lane.id}
                      title={lane.label}
                    >
                      {groupedLocked[lane.id].length === 0 ? (
                        <EmptyState>No {lane.label.toLowerCase()}.</EmptyState>
                      ) : null}
                      {groupedLocked[lane.id].map((item) => {
                        const edit = lockedEdits[item.id] ?? {
                          reason: item.reason ?? '',
                          text: item.text,
                        }
                        return (
                          <BoardItemRow
                            actions={
                              <ButtonGroup>
                                <Button
                                  className="h-7 px-2 text-xs"
                                  disabled={Boolean(saving) || !edit.text.trim()}
                                  onClick={() =>
                                    void updateLocked(item.id, {
                                      reason: edit.reason,
                                      text: edit.text,
                                    })
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Save
                                </Button>
                                <Button
                                  className="h-7 px-2 text-xs"
                                  disabled={Boolean(saving)}
                                  onClick={() =>
                                    void updateLocked(item.id, {
                                      action: item.status === 'archived' ? 'restore' : 'archive',
                                    })
                                  }
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {item.status === 'archived' ? 'Restore' : 'Archive'}
                                </Button>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="size-7"
                                      disabled={Boolean(saving)}
                                      onClick={() => void deleteLocked(item.id)}
                                      size="icon"
                                      type="button"
                                      variant="ghost"
                                    >
                                      <IconTrash className="size-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete locked record</TooltipContent>
                                </Tooltip>
                              </ButtonGroup>
                            }
                            key={item.id}
                            meta={
                              <>
                                #{item.id}
                                {item.updated_by ? ` updated by ${item.updated_by}` : ''}
                              </>
                            }
                            status={normalizeLockedStatus(item.status)}
                            statusClassName={statusBadgeClass(normalizeLockedStatus(item.status))}
                            title={
                              <div className="space-y-1.5">
                                <Textarea
                                  className="min-h-16 resize-none text-sm"
                                  onChange={(event) =>
                                    setLockedEdits((current) => ({
                                      ...current,
                                      [item.id]: { ...edit, text: event.target.value },
                                    }))
                                  }
                                  value={edit.text}
                                />
                                <Input
                                  className="h-8 text-xs"
                                  onChange={(event) =>
                                    setLockedEdits((current) => ({
                                      ...current,
                                      [item.id]: { ...edit, reason: event.target.value },
                                    }))
                                  }
                                  placeholder="Reason"
                                  value={edit.reason}
                                />
                              </div>
                            }
                          />
                        )
                      })}
                    </BoardSection>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ) : null}

          {isTabAvailable('pins') ? (
            <TabsContent value="pins" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <BoardForm onSubmit={(event) => void createPin(event)}>
                    <ButtonGroup className="w-full">
                      <Input
                        className="h-8 text-xs"
                        inputMode="numeric"
                        onChange={(event) => setPinMessageId(event.target.value)}
                        placeholder="Message ID"
                        value={pinMessageId}
                      />
                      <Button
                        className="h-8 px-3 text-xs"
                        disabled={!pinMessageId.trim() || Boolean(saving)}
                        size="sm"
                        type="submit"
                      >
                        Pin
                      </Button>
                    </ButtonGroup>
                  </BoardForm>

                  {pins.length > 0 ? (
                    <div className="flex justify-end">
                      <Button
                        className="h-7 px-2 text-xs"
                        disabled={Boolean(saving)}
                        onClick={() => void clearPins()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Clear All
                      </Button>
                    </div>
                  ) : null}

                  {pins.length === 0 ? <EmptyState>{boardTabs[3].empty}</EmptyState> : null}
                  {pinLanes.map((lane) => (
                    <BoardSection
                      count={groupedPins[lane.id].length}
                      defaultOpen
                      description={lane.description}
                      key={lane.id}
                      title={lane.label}
                    >
                      {groupedPins[lane.id].length === 0 ? (
                        <EmptyState>No {lane.label.toLowerCase()} pins.</EmptyState>
                      ) : null}
                      {groupedPins[lane.id].map((pin) => (
                        <BoardItemRow
                          actions={
                            <ButtonGroup>
                              {pin.status === 'todo' ? (
                                <Button
                                  className="h-7 px-2 text-xs"
                                  disabled={Boolean(saving)}
                                  onClick={() => void updatePin(pin.message_id, 'done')}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Done
                                </Button>
                              ) : (
                                <Button
                                  className="h-7 px-2 text-xs"
                                  disabled={Boolean(saving)}
                                  onClick={() => void updatePin(pin.message_id, 'reopen')}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  Reopen
                                </Button>
                              )}
                              <Button
                                className="h-7 px-2 text-xs"
                                disabled={Boolean(saving)}
                                onClick={() => void updatePin(pin.message_id, 'remove')}
                                size="sm"
                                type="button"
                                variant="ghost"
                              >
                                Remove
                              </Button>
                            </ButtonGroup>
                          }
                          key={pin.message_id}
                          meta={
                            <>
                              #{pin.message_id} {pin.message.sender ?? 'unknown'} /{' '}
                              {pin.message.channel ?? 'general'}
                              {pin.message.time ? ` / ${pin.message.time}` : ''}
                            </>
                          }
                          status={pin.status}
                          statusClassName={statusBadgeClass(pin.status)}
                          title={pin.message.text}
                        />
                      ))}
                    </BoardSection>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>
          ) : null}
        </Tabs>
      </section>
    </DndContext>
  )
}
