'use client'

import {
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/cn'

type BoardTabId = 'rules' | 'jobs' | 'locked' | 'pins'

type CapabilityTab = {
  id: BoardTabId
  label: string
  category: string
  tools: string[]
}

type RuleItem = {
  id: number
  text: string
  reason?: string
  status: 'pending' | 'draft' | 'active' | 'archived' | string
  author?: string
  created_at?: number
}

type JobItem = {
  id: number
  title: string
  body?: string
  status: 'open' | 'done' | 'archived' | string
  channel?: string
  assignee?: string
  created_by?: string
  updated_at?: number
  messages?: Array<{
    id: number
    sender?: string
    text?: string
    time?: string
    deleted?: boolean
  }>
}

type LockedItem = {
  id: number
  text: string
  reason?: string
  status: 'active' | 'archived' | string
  created_by?: string
  updated_by?: string
  updated_at?: number
}

type PinItem = {
  message_id: number
  status: 'todo' | 'done'
  message: {
    id: number
    sender?: string
    text?: string
    type?: string
    time?: string
    timestamp?: number
    channel?: string
  }
}

const boardTabs: Array<{ id: BoardTabId; label: string; empty: string }> = [
  { id: 'rules', label: 'Rules', empty: 'No rules yet.' },
  { id: 'jobs', label: 'Jobs', empty: 'No jobs yet.' },
  { id: 'locked', label: 'Locked', empty: 'No locked records yet.' },
  { id: 'pins', label: 'Pinned', empty: 'No pinned messages yet.' },
]

const boardTabIds = new Set<BoardTabId>(boardTabs.map((tab) => tab.id))

function isBoardTabId(value: string): value is BoardTabId {
  return boardTabIds.has(value as BoardTabId)
}

function getSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  const fromQuery = new URLSearchParams(window.location.search).get('token')
  if (fromQuery) {
    return fromQuery
  }

  const chattrWindow = window as Window & {
    __SESSION_TOKEN__?: string
    __CHATTR_SESSION_TOKEN__?: string
    __CHATTR_SESSION__?: { token?: string }
  }

  if (chattrWindow.__SESSION_TOKEN__) {
    return chattrWindow.__SESSION_TOKEN__
  }

  if (chattrWindow.__CHATTR_SESSION_TOKEN__) {
    return chattrWindow.__CHATTR_SESSION_TOKEN__
  }

  if (chattrWindow.__CHATTR_SESSION__?.token) {
    return chattrWindow.__CHATTR_SESSION__.token
  }

  try {
    return window.localStorage.getItem('chattr.sessionToken') ?? ''
  } catch {
    return ''
  }
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getSessionToken()

  if (token) {
    headers.set('X-Session-Token', token)
  }

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

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

function ItemShell({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('rounded-md border-border/60 bg-background py-0 shadow-sm', className)}>
      <CardContent className="px-3 py-2">{children}</CardContent>
    </Card>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="rounded-md border-border/60 bg-background py-0 shadow-sm">
      <CardContent className="px-3 py-6 text-center text-xs text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
}

function BoardPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn('rounded-md border-border/60 bg-background py-0 shadow-sm', className)}>
      <CardContent className="p-3">{children}</CardContent>
    </Card>
  )
}

function BoardForm({ children, className, ...props }: ComponentProps<'form'>) {
  return (
    <Card className="rounded-md border-border/60 bg-background py-0 shadow-sm">
      <CardContent className="p-3">
        <form className={className} {...props}>
          {children}
        </form>
      </CardContent>
    </Card>
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

  const counts: Record<BoardTabId, number> = useMemo(
    () => ({
      rules: rules.filter((rule) => rule.status !== 'archived').length,
      jobs: jobs.filter((job) => job.status !== 'archived').length,
      locked: locked.filter((item) => item.status !== 'archived').length,
      pins: pins.filter((pin) => pin.status === 'todo').length,
    }),
    [jobs, locked, pins, rules]
  )

  const loadBoard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const capabilityResponse = await apiJson<{ tabs: CapabilityTab[] }>(
        '/api/right-rail/capabilities'
      )
      const nextCapabilities = capabilityResponse.tabs.filter((tab) => isBoardTabId(tab.id))
      setCapabilities(nextCapabilities)

      const allowed = new Set(nextCapabilities.map((tab) => tab.id))
      const [
        nextRules,
        nextJobs,
        nextLocked,
        nextPins,
      ] = await Promise.all([
        allowed.has('rules') ? apiJson<RuleItem[]>('/api/rules') : Promise.resolve([]),
        allowed.has('jobs') ? apiJson<JobItem[]>('/api/jobs') : Promise.resolve([]),
        allowed.has('locked') ? apiJson<LockedItem[]>('/api/locked') : Promise.resolve([]),
        allowed.has('pins') ? apiJson<PinItem[]>('/api/pins') : Promise.resolve([]),
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
    async (status: 'draft' | 'active') => {
      const text = ruleDraft.text.trim()
      if (!text) {
        return
      }
      await withSave(`create-rule-${status}`, async () => {
        await apiJson<RuleItem>('/api/rules', {
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
        await apiJson<RuleItem>(`/api/rules/${ruleId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
        setEditingRule(null)
      })
    },
    [withSave]
  )

  const deleteRule = useCallback(
    async (ruleId: number) => {
      await withSave(`delete-rule-${ruleId}`, async () => {
        await apiJson(`/api/rules/${ruleId}`, { method: 'DELETE' })
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
        await apiJson<JobItem>('/api/jobs', {
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
        await apiJson<JobItem>(`/api/jobs/${jobId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const deleteJob = useCallback(
    async (jobId: number) => {
      await withSave(`delete-job-${jobId}`, async () => {
        await apiJson(`/api/jobs/${jobId}?permanent=true`, { method: 'DELETE' })
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
        await apiJson(`/api/jobs/${jobId}/messages`, {
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
        await apiJson<LockedItem>('/api/locked', {
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
        await apiJson<LockedItem>(`/api/locked/${lockedId}`, {
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
        await apiJson(`/api/locked/${lockedId}`, { method: 'DELETE' })
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
        await apiJson<PinItem>('/api/pins', {
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
        await apiJson(`/api/pins/${messageId}`, {
          body: JSON.stringify({ action }),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const clearPins = useCallback(async () => {
    await withSave('clear-pins', async () => {
      await apiJson('/api/pins', { method: 'DELETE' })
    })
  }, [withSave])

  return (
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
                className="h-10 min-w-0 flex-1 basis-0 overflow-hidden rounded-none px-1.5 text-xs active:scale-95"
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

        <div className="flex w-full min-w-0 shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Badge variant="outline" className="h-5 shrink-0 text-[11px]">
            MCP-backed
          </Badge>
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            Rules, jobs, locked coordination, and pinned messages.
          </p>
          <Button
            className="h-7 shrink-0 px-2 text-xs active:scale-95"
            disabled={loading}
            onClick={() => void loadBoard()}
            size="sm"
            type="button"
            variant="outline"
          >
            Refresh
          </Button>
        </div>

        {error ? (
          <Alert variant="destructive" className="m-3 mb-0 rounded-md">
            <AlertTitle>Board API error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {availableTabs.length === 0 ? (
          <div className="p-3">
            <EmptyState>No MCP-backed Board tabs are available.</EmptyState>
          </div>
        ) : null}

        {isTabAvailable('rules') ? (
          <TabsContent value="rules" className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="space-y-3 p-3">
                <BoardPanel>
                  <Textarea
                    className="min-h-20 resize-none text-sm"
                    onChange={(event) => setRuleDraft((current) => ({ ...current, text: event.target.value }))}
                    placeholder="Rule text"
                    value={ruleDraft.text}
                  />
                  <Input
                    className="mt-2 h-8 text-xs"
                    onChange={(event) => setRuleDraft((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="Reason"
                    value={ruleDraft.reason}
                  />
                  <ButtonGroup className="mt-2 ml-auto">
                    <Button
                      className="h-7 px-2 text-xs active:scale-95"
                      disabled={!ruleDraft.text.trim() || Boolean(saving)}
                      onClick={() => void createRule('draft')}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Save Draft
                    </Button>
                    <Button
                      className="h-7 px-2 text-xs active:scale-95"
                      disabled={!ruleDraft.text.trim() || Boolean(saving)}
                      onClick={() => void createRule('active')}
                      size="sm"
                      type="button"
                    >
                      Activate
                    </Button>
                  </ButtonGroup>
                </BoardPanel>

              {rules.length === 0 ? <EmptyState>{boardTabs[0].empty}</EmptyState> : null}
              {rules.map((rule) => (
                <ItemShell key={rule.id}>
                  <div className="flex items-start gap-2">
                    <Badge className={cn('h-5 text-[11px]', statusBadgeClass(rule.status))}>
                      {rule.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      {editingRule?.id === rule.id ? (
                        <div className="space-y-2">
                          <Textarea
                            className="min-h-16 resize-none text-sm"
                            onChange={(event) =>
                              setEditingRule((current) =>
                                current ? { ...current, text: event.target.value } : current
                              )
                            }
                            value={editingRule.text}
                          />
                          <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                              setEditingRule((current) =>
                                current ? { ...current, reason: event.target.value } : current
                              )
                            }
                            value={editingRule.reason}
                          />
                        </div>
                      ) : (
                        <>
                          <p className="text-sm leading-5">{rule.text}</p>
                          {rule.reason ? (
                            <p className="mt-1 text-xs text-muted-foreground">{rule.reason}</p>
                          ) : null}
                        </>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        #{rule.id}
                        {rule.author ? ` by ${rule.author}` : ''}
                      </p>
                    </div>
                  </div>
                  <ButtonGroup className="mt-2 ml-auto flex-wrap justify-end">
                    {editingRule?.id === rule.id ? (
                      <>
                        <Button
                          className="h-7 px-2 text-xs active:scale-95"
                          disabled={Boolean(saving) || !editingRule.text.trim()}
                          onClick={() =>
                            void updateRule(rule.id, {
                              reason: editingRule.reason,
                              text: editingRule.text,
                            })
                          }
                          size="sm"
                          type="button"
                        >
                          Save
                        </Button>
                        <Button
                          className="h-7 px-2 text-xs active:scale-95"
                          onClick={() => setEditingRule(null)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        onClick={() =>
                          setEditingRule({
                            id: rule.id,
                            reason: rule.reason ?? '',
                            text: rule.text,
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Edit
                      </Button>
                    )}
                    {rule.status !== 'active' ? (
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving)}
                        onClick={() => void updateRule(rule.id, { action: 'activate' })}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Activate
                      </Button>
                    ) : null}
                    {rule.status !== 'draft' ? (
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving)}
                        onClick={() => void updateRule(rule.id, { action: 'draft' })}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Draft
                      </Button>
                    ) : null}
                    {rule.status !== 'archived' ? (
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving)}
                        onClick={() => void updateRule(rule.id, { action: 'archive' })}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Archive
                      </Button>
                    ) : null}
                    <Button
                      className="h-7 px-2 text-xs active:scale-95"
                      disabled={Boolean(saving)}
                      onClick={() => void deleteRule(rule.id)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  </ButtonGroup>
                </ItemShell>
              ))}
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
                  onChange={(event) => setJobDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Job title"
                  value={jobDraft.title}
                />
                <Textarea
                  className="mt-2 min-h-20 resize-none text-sm"
                  onChange={(event) => setJobDraft((current) => ({ ...current, body: event.target.value }))}
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
                    className="h-8 px-3 text-xs active:scale-95"
                    disabled={!jobDraft.title.trim() || Boolean(saving)}
                    size="sm"
                    type="submit"
                  >
                    Create
                  </Button>
                </ButtonGroup>
              </BoardForm>

              {jobs.length === 0 ? <EmptyState>{boardTabs[1].empty}</EmptyState> : null}
              {jobs.map((job) => {
                const edit = jobEdits[job.id] ?? {
                  assignee: job.assignee ?? '',
                  title: job.title,
                }
                const visibleMessages = (job.messages ?? []).filter((message) => !message.deleted)

                return (
                  <ItemShell key={job.id}>
                    <div className="flex items-start gap-2">
                      <Badge className={cn('h-5 text-[11px]', statusBadgeClass(job.status))}>
                        {job.status}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <Input
                          className="h-8 text-sm font-medium"
                          onChange={(event) =>
                            setJobEdits((current) => ({
                              ...current,
                              [job.id]: { ...edit, title: event.target.value },
                            }))
                          }
                          value={edit.title}
                        />
                        <ButtonGroup className="mt-2 w-full">
                          <Input
                            className="h-8 text-xs"
                            onChange={(event) =>
                              setJobEdits((current) => ({
                                ...current,
                                [job.id]: { ...edit, assignee: event.target.value },
                              }))
                            }
                            placeholder="Assignee"
                            value={edit.assignee}
                          />
                          <Button
                            className="h-8 px-2 text-xs active:scale-95"
                            disabled={Boolean(saving) || !edit.title.trim()}
                            onClick={() =>
                              void updateJob(job.id, {
                                assignee: edit.assignee,
                                title: edit.title,
                              })
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Save
                          </Button>
                        </ButtonGroup>
                        {job.body ? (
                          <p className="mt-2 text-xs leading-5 text-muted-foreground">{job.body}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          #{job.id} {job.channel ?? 'general'} · {visibleMessages.length} messages
                        </p>
                      </div>
                    </div>
                    {visibleMessages.length > 0 ? (
                      <div className="mt-2 space-y-1 border-t border-border pt-2">
                        {visibleMessages.slice(-3).map((message) => (
                          <p className="text-xs text-muted-foreground" key={message.id}>
                            <span className="font-medium text-foreground">{message.sender ?? 'user'}:</span>{' '}
                            {message.text}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <ButtonGroup className="mt-2 w-full">
                      <Input
                        className="h-8 text-xs"
                        onChange={(event) =>
                          setJobMessages((current) => ({ ...current, [job.id]: event.target.value }))
                        }
                        placeholder="Add thread message"
                        value={jobMessages[job.id] ?? ''}
                      />
                      <Button
                        className="h-8 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving) || !(jobMessages[job.id] ?? '').trim()}
                        onClick={() => void addJobMessage(job.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Send
                      </Button>
                    </ButtonGroup>
                    <ButtonGroup className="mt-2 ml-auto flex-wrap justify-end">
                      {(['open', 'done', 'archived'] as const).map((status) => (
                        <Button
                          className="h-7 px-2 text-xs active:scale-95"
                          disabled={Boolean(saving) || job.status === status}
                          key={status}
                          onClick={() => void updateJob(job.id, { status })}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {status}
                        </Button>
                      ))}
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving)}
                        onClick={() => void deleteJob(job.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    </ButtonGroup>
                  </ItemShell>
                )
              })}
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
                    className="h-8 px-3 text-xs active:scale-95"
                    disabled={!lockedDraft.text.trim() || Boolean(saving)}
                    size="sm"
                    type="submit"
                  >
                    Lock
                  </Button>
                </ButtonGroup>
              </BoardForm>

              {locked.length === 0 ? <EmptyState>{boardTabs[2].empty}</EmptyState> : null}
              {locked.map((item) => {
                const edit = lockedEdits[item.id] ?? {
                  reason: item.reason ?? '',
                  text: item.text,
                }

                return (
                  <ItemShell key={item.id}>
                    <div className="flex items-start gap-2">
                      <Badge className={cn('h-5 text-[11px]', statusBadgeClass(item.status))}>
                        {item.status}
                      </Badge>
                      <div className="min-w-0 flex-1 space-y-2">
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
                        <p className="text-[11px] text-muted-foreground">
                          #{item.id}
                          {item.updated_by ? ` updated by ${item.updated_by}` : ''}
                        </p>
                      </div>
                    </div>
                    <ButtonGroup className="mt-2 ml-auto flex-wrap justify-end">
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
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
                        className="h-7 px-2 text-xs active:scale-95"
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
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
                        disabled={Boolean(saving)}
                        onClick={() => void deleteLocked(item.id)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    </ButtonGroup>
                  </ItemShell>
                )
              })}
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
                    className="h-8 px-3 text-xs active:scale-95"
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
                    className="h-7 px-2 text-xs active:scale-95"
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
              {pins.map((pin) => (
                <ItemShell key={pin.message_id}>
                  <div className="flex items-start gap-2">
                    <Badge className={cn('h-5 text-[11px]', statusBadgeClass(pin.status))}>
                      {pin.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-5">{pin.message.text}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        #{pin.message_id} {pin.message.sender ?? 'unknown'} ·{' '}
                        {pin.message.channel ?? 'general'}
                        {pin.message.time ? ` · ${pin.message.time}` : ''}
                      </p>
                    </div>
                  </div>
                  <ButtonGroup className="mt-2 ml-auto flex-wrap justify-end">
                    {pin.status === 'todo' ? (
                      <Button
                        className="h-7 px-2 text-xs active:scale-95"
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
                        className="h-7 px-2 text-xs active:scale-95"
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
                      className="h-7 px-2 text-xs active:scale-95"
                      disabled={Boolean(saving)}
                      onClick={() => void updatePin(pin.message_id, 'remove')}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </ButtonGroup>
                </ItemShell>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        ) : null}
      </Tabs>
    </section>
  )
}
