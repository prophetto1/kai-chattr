'use client'

import {
  type ComponentType,
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
  IconEdit,
  IconGavel,
  IconListCheck,
  IconPinned,
  IconPlus,
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

type DragRecord =
  | { type: 'rule'; id: number; status: RuleLaneId }
  | { type: 'decision'; id: number; status: LockedLaneId }

type RuleMode =
  | { type: 'list' }
  | { body: string; title: string; type: 'create' }
  | { body: string; id: number; title: string; type: 'edit' }

type DecisionFields = { details: string; reason: string; title: string }

type DecisionMode =
  | { type: 'list' }
  | (DecisionFields & { type: 'create' })
  | (DecisionFields & { id: number; type: 'edit' })

const ruleLanes: Array<{ id: Exclude<RuleLaneId, 'draft'>; label: string; description: string }> = [
  { id: 'active', label: 'Active', description: 'injected into agent context' },
  { id: 'archived', label: 'Inactive', description: 'retained but not injected' },
]
const activeRuleLane = ruleLanes[0]
const secondaryRuleLanes = ruleLanes.slice(1)

const decisionLanes: Array<{ id: LockedLaneId; label: string; description: string }> = [
  { id: 'active', label: 'Active', description: 'decisions in force' },
  { id: 'archived', label: 'Inactive', description: 'retained but not in force' },
]
const activeDecisionLane = decisionLanes[0]
const secondaryDecisionLanes = decisionLanes.slice(1)

const pinLanes: Array<{ id: PinLaneId; label: string; description: string }> = [
  { id: 'todo', label: 'Todo', description: 'pinned follow-ups' },
  { id: 'done', label: 'Done', description: 'completed pins' },
]

const boardTabMeta: Record<BoardTabId, { icon: ComponentType<{ className?: string }> }> = {
  rules: { icon: IconListCheck },
  decisions: { icon: IconGavel },
  pins: { icon: IconPinned },
}

const ruleBodyMaxLength = 240
const ruleTitleMaxLength = 96
const decisionTitleMaxLength = 96
const decisionDetailsMaxLength = 500
const decisionReasonMaxLength = 240
const boardScrollViewportClassName =
  'overflow-x-hidden [&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full [&>div]:!max-w-full'

function trimRuleBody(value: string) {
  return value.trim().slice(0, ruleBodyMaxLength)
}

function trimRuleTitle(value: string) {
  return value.trim().slice(0, ruleTitleMaxLength)
}

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
  body,
  disabled,
  onCancel,
  onBodyChange,
  onSave,
  onTitleChange,
  title,
  titleValue,
}: {
  body: string
  disabled: boolean
  onCancel: () => void
  onBodyChange: (value: string) => void
  onSave: () => void
  onTitleChange: (value: string) => void
  title?: string
  titleValue: string
}) {
  const saveDisabled = disabled || !titleValue.trim()

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
      <Input
        className="h-9 text-sm"
        maxLength={ruleTitleMaxLength}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder="Rule title"
        value={titleValue}
      />
      <Textarea
        className="mt-2 min-h-28 resize-none text-sm"
        maxLength={ruleBodyMaxLength}
        onChange={(event) => onBodyChange(event.target.value)}
        placeholder="Write the rule details..."
        value={body}
      />
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{titleValue.length}/{ruleTitleMaxLength} title</span>
        <span>{body.length}/{ruleBodyMaxLength} details</span>
      </div>
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
  onDelete,
  onEdit,
  rule,
  saving,
}: {
  onDelete: (rule: RuleItem) => void
  onEdit: (rule: RuleItem) => void
  rule: RuleItem
  saving: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const status = normalizeRuleStatus(rule.status)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    data: { id: rule.id, status, type: 'rule' } satisfies DragRecord,
    id: `rule:${rule.id}`,
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const details = rule.reason?.trim()
  const title = rule.text.trim() || 'Untitled rule'

  return (
    <BoardItemRow
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      ref={setNodeRef}
      status={status}
      statusClassName={statusBadgeClass(status)}
      style={style}
      title={
        <button
          aria-expanded={expanded}
          className="block w-full min-w-0 max-w-full truncate rounded-sm text-left !text-[13px] font-medium text-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {title}
        </button>
      }
    >
      {expanded ? (
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
          <div className="mb-1 text-[11px] text-muted-foreground">
            #{rule.id}
            {rule.author ? ` by ${rule.author}` : ''}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
            {details || 'No additional rule details yet.'}
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-7"
                  disabled={saving}
                  onClick={() => onDelete(rule)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <IconTrash className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete rule</TooltipContent>
            </Tooltip>
            <Button
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => onEdit(rule)}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconEdit className="size-3.5" />
              Edit rule
            </Button>
          </div>
        </div>
      ) : null}
    </BoardItemRow>
  )
}

function DecisionForm({
  disabled,
  fields,
  onCancel,
  onChange,
  onSave,
  title,
}: {
  disabled: boolean
  fields: DecisionFields
  onCancel: () => void
  onChange: (next: Partial<DecisionFields>) => void
  onSave: () => void
  title?: string
}) {
  const saveDisabled = disabled || !fields.title.trim()

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
      <Input
        className="h-9 text-sm"
        maxLength={decisionTitleMaxLength}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="Decision title"
        value={fields.title}
      />
      <Textarea
        className="mt-2 min-h-24 resize-none text-sm"
        maxLength={decisionDetailsMaxLength}
        onChange={(event) => onChange({ details: event.target.value })}
        placeholder="Decision details..."
        value={fields.details}
      />
      <Textarea
        className="mt-2 min-h-16 resize-none text-sm"
        maxLength={decisionReasonMaxLength}
        onChange={(event) => onChange({ reason: event.target.value })}
        placeholder="Reason"
        value={fields.reason}
      />
      <div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{fields.title.length}/{decisionTitleMaxLength} title</span>
        <span>{fields.details.length}/{decisionDetailsMaxLength} details</span>
        <span>{fields.reason.length}/{decisionReasonMaxLength} reason</span>
      </div>
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

function DecisionRow({
  item,
  onDelete,
  onEdit,
  saving,
}: {
  item: LockedItem
  onDelete: (item: LockedItem) => void
  onEdit: (item: LockedItem) => void
  saving: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const status = normalizeLockedStatus(item.status)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    data: { id: item.id, status, type: 'decision' } satisfies DragRecord,
    id: `decision:${item.id}`,
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined
  const details = item.details?.trim()
  const reason = item.reason?.trim()
  const title = item.text.trim() || 'Untitled decision'

  return (
    <BoardItemRow
      dragHandleProps={{ ...attributes, ...listeners }}
      isDragging={isDragging}
      ref={setNodeRef}
      status={status}
      statusClassName={statusBadgeClass(status)}
      style={style}
      title={
        <button
          aria-expanded={expanded}
          className="block w-full min-w-0 max-w-full truncate rounded-sm text-left !text-[13px] font-medium text-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          {title}
        </button>
      }
    >
      {expanded ? (
        <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
          <div className="mb-1 text-[11px] text-muted-foreground">
            #{item.id}
            {item.updated_by ? ` updated by ${item.updated_by}` : ''}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-5 text-foreground">
            {details || 'No decision details yet.'}
          </p>
          {reason ? (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground/80">Reason:</span> {reason}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="size-7"
                  disabled={saving}
                  onClick={() => onDelete(item)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <IconTrash className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete decision</TooltipContent>
            </Tooltip>
            <Button
              className="h-7 px-2 text-xs"
              disabled={saving}
              onClick={() => onEdit(item)}
              size="sm"
              type="button"
              variant="outline"
            >
              <IconEdit className="size-3.5" />
              Edit decision
            </Button>
          </div>
        </div>
      ) : null}
    </BoardItemRow>
  )
}

function BoardDragPreview({
  drag,
  lockedItem,
  rule,
}: {
  drag: DragRecord | null
  lockedItem?: LockedItem
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

  if (drag?.type === 'decision' && lockedItem) {
    const status = normalizeLockedStatus(lockedItem.status)

    return (
      <BoardItemRow
        className={previewClassName}
        isDragging
        meta={<>#{lockedItem.id}{lockedItem.updated_by ? ` updated by ${lockedItem.updated_by}` : ''}</>}
        status={status}
        statusClassName={statusBadgeClass(status)}
        title={<span>{lockedItem.text}</span>}
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
  const [decisionMode, setDecisionMode] = useState<DecisionMode>({ type: 'list' })
  const [activeDrag, setActiveDrag] = useState<DragRecord | null>(null)
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
  // Two-lane display (parity with Decisions): legacy drafts fold into Inactive.
  const ruleLaneItems = useMemo(
    () => ({
      active: groupedRules.active,
      archived: [...groupedRules.draft, ...groupedRules.archived],
    }),
    [groupedRules]
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
  const activeDragLocked = useMemo(
    () =>
      activeDrag?.type === 'decision'
        ? locked.find((item) => item.id === activeDrag.id)
        : undefined,
    [activeDrag, locked]
  )

  const counts: Record<BoardTabId, number> = useMemo(
    () => ({
      rules: groupedRules.active.length,
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
    async (titleValue: string, bodyValue: string) => {
      const text = trimRuleTitle(titleValue)
      const reason = trimRuleBody(bodyValue)
      if (!text) {
        return
      }
      await withSave('create-rule', async () => {
        await chattrJson<RuleItem>('/api/rules', {
          body: JSON.stringify({ reason, status: 'active', text }),
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
    async (ruleId: number, titleValue: string, bodyValue: string) => {
      const text = trimRuleTitle(titleValue)
      const reason = trimRuleBody(bodyValue)
      if (!text) {
        return
      }
      await withSave(`rule-${ruleId}-edit`, async () => {
        await chattrJson<RuleItem>(`/api/rules/${ruleId}`, {
          body: JSON.stringify({ reason, text }),
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

  const createDecision = useCallback(
    async (fields: DecisionFields) => {
      const text = fields.title.trim().slice(0, decisionTitleMaxLength)
      if (!text) {
        return
      }
      await withSave('create-decision', async () => {
        await chattrJson<LockedItem>('/api/locked', {
          body: JSON.stringify({
            details: fields.details.trim().slice(0, decisionDetailsMaxLength),
            reason: fields.reason.trim().slice(0, decisionReasonMaxLength),
            sender: 'user',
            text,
          }),
          method: 'POST',
        })
        setDecisionMode({ type: 'list' })
      })
    },
    [withSave]
  )

  const saveDecisionEdit = useCallback(
    async (decisionId: number, fields: DecisionFields) => {
      const text = fields.title.trim().slice(0, decisionTitleMaxLength)
      if (!text) {
        return
      }
      await withSave(`locked-${decisionId}-edit`, async () => {
        await chattrJson<LockedItem>(`/api/locked/${decisionId}`, {
          body: JSON.stringify({
            details: fields.details.trim().slice(0, decisionDetailsMaxLength),
            reason: fields.reason.trim().slice(0, decisionReasonMaxLength),
            text,
          }),
          method: 'PATCH',
        })
        setDecisionMode({ type: 'list' })
      })
    },
    [withSave]
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

      if (activeData.type === 'decision') {
        const status = overId.startsWith('decisions:')
          ? (overId.slice('decisions:'.length) as LockedLaneId)
          : overData?.type === 'decision'
            ? overData.status
            : null
        if (status && status !== activeData.status) {
          void updateLocked(
            activeData.id,
            { action: status === 'archived' ? 'archive' : 'restore' },
            `locked-${activeData.id}-${status}`
          )
        }
        return
      }

    },
    [deleteRule, setRuleStatus, updateLocked]
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
          <div className="flex h-11 w-full min-w-0 shrink-0 items-stretch gap-3 overflow-hidden border-b border-border bg-card px-3">
            <TabsList
              aria-label="Board sections"
              variant="line"
              className="flex h-11 min-w-0 flex-1 max-w-full !flex-row items-stretch justify-start gap-5 overflow-x-auto rounded-none bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {availableTabs.map((tab) => {
                const Icon = boardTabMeta[tab.id].icon

                return (
                  <TabsTrigger
                    className="group/board-tab h-11 !w-auto flex-none !justify-center rounded-none border-x-0 border-t-0 border-b-2 border-transparent bg-transparent px-0 text-[13px] font-semibold text-muted-foreground shadow-none transition-[border-color,color,transform] duration-150 after:hidden active:scale-[0.98] hover:text-foreground data-[state=active]:border-b-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent [&_svg]:size-4"
                    disabled={loading}
                    key={tab.id}
                    value={tab.id}
                  >
                    <Icon className="text-muted-foreground/80 transition-colors duration-150 group-data-[state=active]/board-tab:text-foreground" />
                    <span>{tab.label}</span>
                    <Badge
                      className="h-4 min-w-4 shrink-0 rounded-[4px] border-border/50 bg-muted/70 px-1 text-[10px] leading-none text-muted-foreground tabular-nums group-data-[state=active]/board-tab:text-foreground"
                      variant="secondary"
                    >
                      {counts[tab.id]}
                    </Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>
            {activeTab === 'rules' && ruleMode.type === 'list' && isTabAvailable('rules') ? (
              <Button
                aria-label="Create new rule"
                className="h-7 shrink-0 self-center px-2 text-xs"
                disabled={loading || Boolean(saving)}
                onClick={() => setRuleMode({ body: '', title: '', type: 'create' })}
                size="sm"
                type="button"
              >
                <IconPlus className="size-3.5" />
                New
              </Button>
            ) : null}
            {activeTab === 'decisions' && decisionMode.type === 'list' && isTabAvailable('decisions') ? (
              <Button
                aria-label="Create new decision"
                className="h-7 shrink-0 self-center px-2 text-xs"
                disabled={loading || Boolean(saving)}
                onClick={() =>
                  setDecisionMode({ details: '', reason: '', title: '', type: 'create' })
                }
                size="sm"
                type="button"
              >
                <IconPlus className="size-3.5" />
                New
              </Button>
            ) : null}
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
                    <ScrollArea
                      className="h-full"
                      viewportClassName={boardScrollViewportClassName}
                    >
                      <div className="pr-1 pb-2">
                        <BoardDropZone id={`rules:${activeRuleLane.id}`}>
                          <BoardSection
                            collapsible={false}
                            count={ruleLaneItems[activeRuleLane.id].length}
                            title={activeRuleLane.label}
                          >
                            {ruleLaneItems[activeRuleLane.id].length === 0 ? (
                              <EmptyState>No active.</EmptyState>
                            ) : null}
                            {ruleLaneItems[activeRuleLane.id].map((rule) => (
                              <RuleRow
                                key={rule.id}
                                onDelete={(nextRule) => void deleteRule(nextRule.id)}
                                onEdit={(nextRule) =>
                                  setRuleMode({
                                    body: nextRule.reason ?? '',
                                    id: nextRule.id,
                                    title: nextRule.text,
                                    type: 'edit',
                                  })
                                }
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
                          count={ruleLaneItems[lane.id].length}
                          defaultOpen={false}
                          description={lane.description}
                          title={lane.label}
                        >
                          {ruleLaneItems[lane.id].length === 0 ? (
                            <EmptyState>No {lane.label.toLowerCase()}.</EmptyState>
                          ) : null}
                          {ruleLaneItems[lane.id].map((rule) => (
                            <RuleRow
                              key={rule.id}
                              onDelete={(nextRule) => void deleteRule(nextRule.id)}
                              onEdit={(nextRule) =>
                                setRuleMode({
                                  body: nextRule.reason ?? '',
                                  id: nextRule.id,
                                  title: nextRule.text,
                                  type: 'edit',
                                })
                              }
                              rule={rule}
                              saving={Boolean(saving)}
                            />
                          ))}
                        </BoardSection>
                      </BoardDropZone>
                    ))}
                  </div>
                </div>
              ) : (
                <ScrollArea
                  className="h-full"
                  viewportClassName={boardScrollViewportClassName}
                >
                  <div className="space-y-3 p-3">
                  {ruleMode.type === 'create' ? (
                    <RuleForm
                      body={ruleMode.body}
                      disabled={Boolean(saving)}
                      onCancel={() => setRuleMode({ type: 'list' })}
                      onBodyChange={(body) =>
                        setRuleMode((current) =>
                          current.type === 'create' ? { ...current, body } : current
                        )
                      }
                      onSave={() => void createRule(ruleMode.title, ruleMode.body)}
                      onTitleChange={(titleValue) =>
                        setRuleMode((current) =>
                          current.type === 'create'
                            ? { ...current, title: titleValue.slice(0, ruleTitleMaxLength) }
                            : current
                        )
                      }
                      title="Create rule"
                      titleValue={ruleMode.title}
                    />
                  ) : null}

                  {ruleMode.type === 'edit' ? (
                    <RuleForm
                      body={ruleMode.body}
                      disabled={Boolean(saving)}
                      onCancel={() => setRuleMode({ type: 'list' })}
                      onBodyChange={(body) =>
                        setRuleMode((current) =>
                          current.type === 'edit' ? { ...current, body } : current
                        )
                      }
                      onSave={() => void saveRuleEdit(ruleMode.id, ruleMode.title, ruleMode.body)}
                      onTitleChange={(titleValue) =>
                        setRuleMode((current) =>
                          current.type === 'edit'
                            ? { ...current, title: titleValue.slice(0, ruleTitleMaxLength) }
                            : current
                        )
                      }
                      title="Edit rule"
                      titleValue={ruleMode.title}
                    />
                  ) : null}

                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          ) : null}

          {isTabAvailable('decisions') ? (
            <TabsContent value="decisions" className="min-h-0 flex-1 overflow-hidden">
              {decisionMode.type === 'list' ? (
                <div className="flex h-full min-h-0 flex-col px-3 pb-3">
                  <div className="min-h-0 flex-1 pt-3">
                    <ScrollArea
                      className="h-full"
                      viewportClassName={boardScrollViewportClassName}
                    >
                      <div className="pr-1 pb-2">
                        <BoardDropZone id={`decisions:${activeDecisionLane.id}`}>
                          <BoardSection
                            collapsible={false}
                            count={groupedLocked[activeDecisionLane.id].length}
                            title={activeDecisionLane.label}
                          >
                            {groupedLocked[activeDecisionLane.id].length === 0 ? (
                              <EmptyState>No active.</EmptyState>
                            ) : null}
                            {groupedLocked[activeDecisionLane.id].map((item) => (
                              <DecisionRow
                                item={item}
                                key={item.id}
                                onDelete={(next) => void deleteLocked(next.id)}
                                onEdit={(next) =>
                                  setDecisionMode({
                                    details: next.details ?? '',
                                    id: next.id,
                                    reason: next.reason ?? '',
                                    title: next.text,
                                    type: 'edit',
                                  })
                                }
                                saving={Boolean(saving)}
                              />
                            ))}
                          </BoardSection>
                        </BoardDropZone>
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="shrink-0 space-y-3 pt-3">
                    {secondaryDecisionLanes.map((lane) => (
                      <BoardDropZone id={`decisions:${lane.id}`} key={lane.id}>
                        <BoardSection
                          count={groupedLocked[lane.id].length}
                          defaultOpen={false}
                          description={lane.description}
                          title={lane.label}
                        >
                          {groupedLocked[lane.id].length === 0 ? (
                            <EmptyState>No {lane.label.toLowerCase()}.</EmptyState>
                          ) : null}
                          {groupedLocked[lane.id].map((item) => (
                            <DecisionRow
                              item={item}
                              key={item.id}
                              onDelete={(next) => void deleteLocked(next.id)}
                              onEdit={(next) =>
                                setDecisionMode({
                                  details: next.details ?? '',
                                  id: next.id,
                                  reason: next.reason ?? '',
                                  title: next.text,
                                  type: 'edit',
                                })
                              }
                              saving={Boolean(saving)}
                            />
                          ))}
                        </BoardSection>
                      </BoardDropZone>
                    ))}
                  </div>
                </div>
              ) : (
                <ScrollArea
                  className="h-full"
                  viewportClassName={boardScrollViewportClassName}
                >
                  <div className="space-y-3 p-3">
                    {decisionMode.type === 'create' ? (
                      <DecisionForm
                        disabled={Boolean(saving)}
                        fields={decisionMode}
                        onCancel={() => setDecisionMode({ type: 'list' })}
                        onChange={(next) =>
                          setDecisionMode((current) =>
                            current.type === 'create' ? { ...current, ...next } : current
                          )
                        }
                        onSave={() => void createDecision(decisionMode)}
                        title="Create decision"
                      />
                    ) : null}

                    {decisionMode.type === 'edit' ? (
                      <DecisionForm
                        disabled={Boolean(saving)}
                        fields={decisionMode}
                        onCancel={() => setDecisionMode({ type: 'list' })}
                        onChange={(next) =>
                          setDecisionMode((current) =>
                            current.type === 'edit' ? { ...current, ...next } : current
                          )
                        }
                        onSave={() => void saveDecisionEdit(decisionMode.id, decisionMode)}
                        title="Edit decision"
                      />
                    ) : null}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          ) : null}

          {isTabAvailable('pins') ? (
            <TabsContent value="pins" className="min-h-0 flex-1 overflow-hidden">
              <ScrollArea className="h-full" viewportClassName={boardScrollViewportClassName}>
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
        <BoardDragPreview drag={activeDrag} lockedItem={activeDragLocked} rule={activeDragRule} />
      </DragOverlay>
    </DndContext>
  )
}
