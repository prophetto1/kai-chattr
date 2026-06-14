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
  DragOverlay,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
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
import { IconTrash } from '@tabler/icons-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BoardDropZone } from '@/components/workbench/board/BoardDropZone'
import { BoardItemRow } from '@/components/workbench/board/BoardItemRow'
import { BoardSection } from '@/components/workbench/board/BoardSection'
import {
  type CapabilityTab,
  type JobItem,
  type JobLaneId,
  normalizeJobStatus,
} from '@/components/workbench/board/types'
import { chattrJson, errorMessage } from '@/lib/chattr-api'

type JobDragRecord = { type: 'job'; id: number; status: JobLaneId; archived?: boolean }

const jobLanes: Array<{ id: JobLaneId; label: string; description: string }> = [
  { id: 'todo', label: 'To do', description: 'ready for work' },
  { id: 'active', label: 'Active', description: 'work in progress' },
  { id: 'closed', label: 'Closed', description: 'closed work threads' },
]

function statusBadgeClass(status: string) {
  if (status === 'todo') {
    return 'bg-emerald-600 text-white'
  }
  if (status === 'active') {
    return 'bg-sky-600 text-white'
  }
  if (status === 'closed') {
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

function JobsForm({
  children,
  onSubmit,
}: {
  children: ReactNode
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}) {
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

function JobDragPreview({
  drag,
  job,
}: {
  drag: JobDragRecord | null
  job?: JobItem
}) {
  if (drag?.type !== 'job' || !job) {
    return null
  }

  const status = normalizeJobStatus(job.status)
  const visibleMessages = (job.messages ?? []).filter((message) => !message.deleted)

  return (
    <BoardItemRow
      className="pointer-events-none w-[520px] max-w-[calc(100vw-2rem)] cursor-grabbing"
      isDragging
      meta={
        <>
          #{job.id} {job.channel ?? 'general'} / {visibleMessages.length} messages
        </>
      }
      status={status}
      statusClassName={statusBadgeClass(status)}
      title={<span>{job.title}</span>}
    >
      {job.body ? <p className="text-xs leading-5 text-muted-foreground">{job.body}</p> : null}
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
  const archived = Boolean(job.archived)
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    data: { archived, id: job.id, status, type: 'job' } satisfies JobDragRecord,
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
              disabled={saving || (status === lane.id && !archived)}
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
                aria-label={archived ? 'Delete job' : 'Archive job'}
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
            <TooltipContent>{archived ? 'Delete job' : 'Archive job'}</TooltipContent>
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

export function JobsDock() {
  const [jobs, setJobs] = useState<JobItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [jobsAvailable, setJobsAvailable] = useState(true)
  const [activeDrag, setActiveDrag] = useState<JobDragRecord | null>(null)
  const [jobDraft, setJobDraft] = useState({ title: '', body: '', assignee: '' })
  const [jobEdits, setJobEdits] = useState<Record<number, { title: string; assignee: string }>>({})
  const [jobMessages, setJobMessages] = useState<Record<number, string>>({})
  const [showArchived, setShowArchived] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const visibleJobs = useMemo(
    () => jobs.filter((job) => Boolean(job.archived) === showArchived),
    [jobs, showArchived]
  )

  const groupedJobs = useMemo(() => {
    const grouped = groupByStatus(
      visibleJobs,
      ['todo', 'active', 'closed'] as const,
      (job) => normalizeJobStatus(job.status)
    )
    return {
      active: sortJobs(grouped.active),
      closed: sortJobs(grouped.closed),
      todo: sortJobs(grouped.todo),
    }
  }, [visibleJobs])
  const activeDragJob = useMemo(
    () => (activeDrag?.type === 'job' ? jobs.find((job) => job.id === activeDrag.id) : undefined),
    [activeDrag, jobs]
  )

  const loadJobs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const capabilityResponse = await chattrJson<{ tabs: CapabilityTab[] }>(
        '/api/right-rail/capabilities'
      )
      const hasJobs = capabilityResponse.tabs.some(
        (tab) => tab.id === 'jobs' || tab.category === 'jobs'
      )
      setJobsAvailable(hasJobs)
      setJobs(hasJobs ? await chattrJson<JobItem[]>('/api/jobs') : [])
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadJobs()
  }, [loadJobs])

  const withSave = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setSaving(key)
      setError('')
      try {
        await action()
        await loadJobs()
      } catch (saveError) {
        setError(errorMessage(saveError))
      } finally {
        setSaving('')
      }
    },
    [loadJobs]
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
        const job = jobs.find((item) => item.id === jobId)
        if (job?.archived) {
          await chattrJson(`/api/jobs/${jobId}?permanent=true`, { method: 'DELETE' })
        } else {
          await chattrJson<JobItem>(`/api/jobs/${jobId}`, {
            body: JSON.stringify({ archived: true, status: 'closed' }),
            method: 'PATCH',
          })
        }
      })
    },
    [jobs, withSave]
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as JobDragRecord | undefined) ?? null)
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null)

      const activeData = event.active.data.current as JobDragRecord | undefined
      if (!activeData || !event.over) {
        return
      }

      const overId = String(event.over.id)
      const overData = event.over.data.current as JobDragRecord | undefined

      if (overId === 'jobs:delete') {
        if (activeData.archived) {
          void deleteJob(activeData.id)
        } else {
          void updateJob(
            activeData.id,
            { archived: true, status: 'closed' },
            `job-${activeData.id}-archived`
          )
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
    },
    [deleteJob, groupedJobs, reorderJobs, updateJob]
  )

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      <section className="flex h-full min-h-0 w-full min-w-0 overflow-hidden bg-card">
        <ScrollArea className="h-full w-full">
          <div className="space-y-3 p-3">
            {error ? (
              <Alert variant="destructive" className="rounded-md">
                <AlertTitle>Jobs API error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {!jobsAvailable && !loading ? (
              <EmptyState>Jobs dock is not available in this runtime.</EmptyState>
            ) : null}

            {jobsAvailable ? (
              <>
                <JobsForm onSubmit={(event) => void createJob(event)}>
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
                </JobsForm>

                <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1.5 text-xs text-muted-foreground">
                  <span>Archived</span>
                  <Switch
                    aria-label="Show archived jobs"
                    checked={showArchived}
                    onCheckedChange={setShowArchived}
                    size="sm"
                  />
                </div>

                {visibleJobs.length === 0 ? (
                  <EmptyState>{showArchived ? 'No archived jobs.' : 'No jobs yet.'}</EmptyState>
                ) : null}
                {jobLanes.map((lane) => {
                  const items = groupedJobs[lane.id]
                  return (
                    <BoardDropZone id={`jobs:${lane.id}`} key={lane.id}>
                      <BoardSection
                        count={items.length}
                        defaultOpen
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
                                  void updateJob(
                                    jobId,
                                    { archived: false, status },
                                    `job-${jobId}-${status}`
                                  )
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
                    Drop jobs here to archive; archived jobs delete.
                  </div>
                </BoardDropZone>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </section>

      <DragOverlay className="z-[100]">
        <JobDragPreview drag={activeDrag} job={activeDragJob} />
      </DragOverlay>
    </DndContext>
  )
}
