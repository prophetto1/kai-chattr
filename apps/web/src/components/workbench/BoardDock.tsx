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
  useDraggable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  IconArchive,
  IconCircle,
  IconCircleCheck,
  IconEdit,
  IconPlus,
  IconRestore,
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
  type LockedItem,
  type LockedLaneId,
  type PinItem,
  type PinLaneId,
  type RuleItem,
  type RuleLaneId,
  boardTabs,
  isBoardTabId,
  normalizeLockedStatus,
  normalizePinStatus,
  normalizeRuleStatus,
} from '@/components/workbench/board/types'
import { chattrJson, errorMessage } from '@/lib/chattr-api'

type DragRecord = { type: 'rule'; id: number; status: RuleLaneId }

type RuleMode =
  | { type: 'list' }
  | { type: 'create'; text: string }
  | { type: 'edit'; id: number; text: string }

const ruleLanes: Array<{ id: RuleLaneId; label: string; description: string }> = [
  { id: 'active', label: 'Active', description: 'injected into agent context' },
  { id: 'draft', label: 'Drafts', description: 'proposed and inactive rules' },
  { id: 'archived', label: 'Archive', description: 'retained but inactive' },
]
const activeRuleLane = ruleLanes[0]
const secondaryRuleLanes = ruleLanes.slice(1)

const lockedLanes: Array<{ id: LockedLaneId; label: string; description: string }> = [
  { id: 'active', label: 'Decisions', description: 'current decisions' },
  { id: 'archived', label: 'Archive', description: 'inactive decisions' },
]

const pinLanes: Array<{ id: PinLaneId; label: string; description: string }> = [
  { id: 'todo', label: 'Todo', description: 'pinned follow-ups' },
  { id: 'done', label: 'Done', description: 'completed pins' },
]

function boardEmptyText(tabId: BoardTabId) {
  return boardTabs.find((tab) => tab.id === tabId)?.empty ?? `No ${tabId} items yet.`
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

function RuleForm({
  disabled,
  onCancel,
  onChange,
  onSave,
  title,
  value,
}: {
  disabled: boolean
  onCancel: () => void
  onChange: (value: string) => void
  onSave: () => void
  title?: string
  value: string
}) {
  const saveDisabled = disabled || !value.trim()

  return (
    <BoardForm
      onSubmit={(event) => {
        event.preventDefault()
        if (!saveDisabled) {
          onSave()
        }
      }}
    >
      {title ? <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3> : null}
      <Textarea
        className="min-h-28 resize-none text-sm"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Write the rule..."
        value={value}
      />
      <div className="mt-2 flex justify-end gap-2">
        <Button
          className="border-destructive/35 text-destructive hover:bg-destructive/10"
          disabled={disabled}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="outline"
        >
          <IconX className="size-4" />
          Cancel
        </Button>
        <Button disabled={saveDisabled} size="sm" type="submit">
          Save
        </Button>
      </div>
    </BoardForm>
  )
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
  onDelete,
  onEdit,
  onStatus,
  rule,
  saving,
}: {
  deleting: boolean
  onDelete: (ruleId: number) => void
  onEdit: (rule: RuleItem) => void
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

  return (
    <BoardItemRow
      actions={
        <ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Edit rule"
                className="size-7"
                disabled={saving}
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
          {status !== 'active' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={status === 'archived' ? 'Restore as active' : 'Activate rule'}
                  className="size-7"
                  disabled={saving}
                  onClick={() => onStatus(rule.id, 'active')}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <IconCircleCheck className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{status === 'archived' ? 'Restore as active' : 'Activate rule'}</TooltipContent>
            </Tooltip>
          ) : null}
          {status !== 'draft' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={status === 'archived' ? 'Restore as draft' : 'Return to draft'}
                  className="size-7"
                  disabled={saving}
                  onClick={() => onStatus(rule.id, 'draft')}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {status === 'archived' ? (
                    <IconRestore className="size-3.5" />
                  ) : (
                    <IconCircle className="size-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{status === 'archived' ? 'Restore as draft' : 'Return to draft'}</TooltipContent>
            </Tooltip>
          ) : null}
          {status !== 'archived' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Archive rule"
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
          {status === 'archived' ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Delete rule"
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
          ) : null}
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
      title={<span>{rule.text}</span>}
    />
  )
}

function BoardDragPreview({
  drag,
  rule,
}: {
  drag: DragRecord | null
  rule?: RuleItem
}) {
  const previewClassName = 'pointer-events-none w-[520px] max-w-[calc(100vw-2rem)] cursor-grabbing'

  if (drag?.type === 'rule' && rule) {
    const status = normalizeRuleStatus(rule.status)

    return (
      <BoardItemRow
        className={previewClassName}
        isDragging
        meta={<>#{rule.id} by {rule.author ?? 'user'}</>}
        status={status}
        statusClassName={statusBadgeClass(status)}
        title={<span>{rule.text}</span>}
      />
    )
  }

  return null
}

export function BoardDock() {
  const [activeTab, setActiveTab] = useState<BoardTabId>('rules')
  const [capabilities, setCapabilities] = useState<CapabilityTab[] | null>(null)
  const [rules, setRules] = useState<RuleItem[]>([])
  const [locked, setLocked] = useState<LockedItem[]>([])
  const [pins, setPins] = useState<PinItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [ruleMode, setRuleMode] = useState<RuleMode>({ type: 'list' })
  const [activeDrag, setActiveDrag] = useState<DragRecord | null>(null)
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
  const activeDragRule = useMemo(
    () => (activeDrag?.type === 'rule' ? rules.find((rule) => rule.id === activeDrag.id) : undefined),
    [activeDrag, rules]
  )

  const counts: Record<BoardTabId, number> = useMemo(
    () => ({
      rules: groupedRules.active.length + groupedRules.draft.length,
      decisions: groupedLocked.active.length,
      pins: groupedPins.todo.length,
    }),
    [groupedLocked, groupedPins, groupedRules]
  )

  const loadBoard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const capabilityResponse = await chattrJson<{ tabs: CapabilityTab[] }>(
        '/api/right-rail/capabilities'
      )
      const nextCapabilities = capabilityResponse.tabs
        .map((tab) =>
          tab.category === 'locked'
            ? { ...tab, id: 'decisions' as const, label: 'Decisions', surface: 'board' as const }
            : tab
        )
        .filter((tab) => (tab.surface ?? 'board') === 'board' && isBoardTabId(tab.id))
      setCapabilities(nextCapabilities)

      const allowedCategories = new Set(nextCapabilities.map((tab) => tab.category))
      const [nextRules, nextLocked, nextPins] = await Promise.all([
        allowedCategories.has('rules') ? chattrJson<RuleItem[]>('/api/rules') : Promise.resolve([]),
        allowedCategories.has('locked') ? chattrJson<LockedItem[]>('/api/locked') : Promise.resolve([]),
        allowedCategories.has('pins') ? chattrJson<PinItem[]>('/api/pins') : Promise.resolve([]),
      ])

      setRules(nextRules)
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
    async (textValue: string) => {
      const text = textValue.trim()
      if (!text) {
        return
      }
      await withSave('create-rule-draft', async () => {
        await chattrJson<RuleItem>('/api/rules', {
          body: JSON.stringify({ reason: '', status: 'draft', text }),
          method: 'POST',
        })
        setRuleMode({ type: 'list' })
      })
    },
    [withSave]
  )

  const updateRule = useCallback(
    async (ruleId: number, body: Record<string, unknown>, key = `rule-${ruleId}`) => {
      await withSave(key, async () => {
        await chattrJson<RuleItem>(`/api/rules/${ruleId}`, {
          body: JSON.stringify(body),
          method: 'PATCH',
        })
      })
    },
    [withSave]
  )

  const saveRuleEdit = useCallback(
    async (ruleId: number, textValue: string) => {
      const text = textValue.trim()
      if (!text) {
        return
      }
      await withSave(`rule-${ruleId}-edit`, async () => {
        await chattrJson<RuleItem>(`/api/rules/${ruleId}`, {
          body: JSON.stringify({ text }),
          method: 'PATCH',
        })
        setRuleMode({ type: 'list' })
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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDrag((event.active.data.current as DragRecord | undefined) ?? null)
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null)

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

    },
    [deleteRule, setRuleStatus]
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
                  className="h-10 min-w-0 overflow-hidden rounded-none px-3 text-xs"
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
              {ruleMode.type === 'list' ? (
                <div className="flex h-full min-h-0 flex-col px-3 pb-3">
                  <div className="min-h-0 flex-1 pt-3">
                    <ScrollArea className="h-full">
                      <div className="pr-1 pb-2">
                        <BoardDropZone id={`rules:${activeRuleLane.id}`}>
                          <BoardSection
                            collapsible={false}
                            count={groupedRules[activeRuleLane.id].length}
                            title={activeRuleLane.label}
                          >
                            {groupedRules[activeRuleLane.id].length === 0 ? (
                              <EmptyState>No active.</EmptyState>
                            ) : null}
                            {groupedRules[activeRuleLane.id].map((rule) => (
                              <RuleRow
                                deleting={saving === `delete-rule-${rule.id}`}
                                key={rule.id}
                                onDelete={(ruleId) => void deleteRule(ruleId)}
                                onEdit={(nextRule) =>
                                  setRuleMode({ id: nextRule.id, text: nextRule.text, type: 'edit' })
                                }
                                onStatus={setRuleStatus}
                                rule={rule}
                                saving={Boolean(saving)}
                              />
                            ))}
                          </BoardSection>
                        </BoardDropZone>
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="shrink-0 space-y-3 pt-3">
                    {secondaryRuleLanes.map((lane) => (
                      <BoardDropZone id={`rules:${lane.id}`} key={lane.id}>
                        <BoardSection
                          count={groupedRules[lane.id].length}
                          defaultOpen={lane.id !== 'archived'}
                          title={lane.label}
                        >
                          {groupedRules[lane.id].length === 0 ? (
                            <EmptyState>No {lane.label.toLowerCase()}.</EmptyState>
                          ) : null}
                          {groupedRules[lane.id].map((rule) => (
                            <RuleRow
                              deleting={saving === `delete-rule-${rule.id}`}
                              key={rule.id}
                              onDelete={(ruleId) => void deleteRule(ruleId)}
                              onEdit={(nextRule) =>
                                setRuleMode({ id: nextRule.id, text: nextRule.text, type: 'edit' })
                              }
                              onStatus={setRuleStatus}
                              rule={rule}
                              saving={Boolean(saving)}
                            />
                          ))}
                        </BoardSection>
                      </BoardDropZone>
                    ))}
                    <div className="flex justify-end">
                      <Button
                        disabled={Boolean(saving)}
                        onClick={() => setRuleMode({ text: '', type: 'create' })}
                        size="sm"
                        type="button"
                      >
                        <IconPlus className="size-4" />
                        {rules.length > 0 ? 'Create rule' : 'Create first rule'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-full">
                  <div className="space-y-3 p-3">
                  {ruleMode.type === 'create' ? (
                    <RuleForm
                      disabled={Boolean(saving)}
                      onCancel={() => setRuleMode({ type: 'list' })}
                      onChange={(text) =>
                        setRuleMode((current) =>
                          current.type === 'create' ? { ...current, text } : current
                        )
                      }
                      onSave={() => void createRule(ruleMode.text)}
                      title="Create rule"
                      value={ruleMode.text}
                    />
                  ) : null}

                  {ruleMode.type === 'edit' ? (
                    <RuleForm
                      disabled={Boolean(saving)}
                      onCancel={() => setRuleMode({ type: 'list' })}
                      onChange={(text) =>
                        setRuleMode((current) =>
                          current.type === 'edit' ? { ...current, text } : current
                        )
                      }
                      onSave={() => void saveRuleEdit(ruleMode.id, ruleMode.text)}
                      value={ruleMode.text}
                    />
                  ) : null}

                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          ) : null}

          {isTabAvailable('decisions') ? (
            <TabsContent value="decisions" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-3 p-3">
                  <BoardForm onSubmit={(event) => void createLocked(event)}>
                    <Textarea
                      className="min-h-20 resize-none text-sm"
                      onChange={(event) =>
                        setLockedDraft((current) => ({ ...current, text: event.target.value }))
                      }
                      placeholder="Decision record"
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
                        Save
                      </Button>
                    </ButtonGroup>
                  </BoardForm>

                  {locked.length === 0 ? <EmptyState>{boardEmptyText('decisions')}</EmptyState> : null}
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
                                  <TooltipContent>Delete decision</TooltipContent>
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

                  {pins.length === 0 ? <EmptyState>{boardEmptyText('pins')}</EmptyState> : null}
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
      <DragOverlay dropAnimation={null} zIndex={1000}>
        <BoardDragPreview drag={activeDrag} rule={activeDragRule} />
      </DragOverlay>
    </DndContext>
  )
}
