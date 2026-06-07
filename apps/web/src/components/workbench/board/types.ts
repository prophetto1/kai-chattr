export type BoardTabId = 'rules' | 'jobs' | 'locked' | 'pins'

export type CapabilityTab = {
  id: BoardTabId
  label: string
  category: string
  tools: string[]
}

export type RuleItem = {
  id: number
  text: string
  reason?: string
  status: 'pending' | 'draft' | 'active' | 'archived' | string
  author?: string
  created_at?: number
}

export type JobItem = {
  id: number
  title: string
  body?: string
  status: 'open' | 'done' | 'archived' | string
  channel?: string
  assignee?: string
  created_by?: string
  updated_at?: number
  sort_order?: number
  messages?: Array<{
    id: number
    sender?: string
    text?: string
    time?: string
    deleted?: boolean
  }>
}

export type LockedItem = {
  id: number
  text: string
  reason?: string
  status: 'active' | 'archived' | string
  created_by?: string
  updated_by?: string
  updated_at?: number
}

export type PinItem = {
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

export const boardTabs: Array<{ id: BoardTabId; label: string; empty: string }> = [
  { id: 'rules', label: 'Rules', empty: 'No rules yet.' },
  { id: 'jobs', label: 'Jobs', empty: 'No jobs yet.' },
  { id: 'locked', label: 'Locked', empty: 'No locked records yet.' },
  { id: 'pins', label: 'Pinned', empty: 'No pinned messages yet.' },
]

const boardTabIds = new Set<BoardTabId>(boardTabs.map((tab) => tab.id))

export function isBoardTabId(value: string): value is BoardTabId {
  return boardTabIds.has(value as BoardTabId)
}

export type RuleLaneId = 'draft' | 'active' | 'archived'
export type JobLaneId = 'open' | 'done' | 'archived'
export type LockedLaneId = 'active' | 'archived'
export type PinLaneId = 'todo' | 'done'

export function normalizeRuleStatus(status: string): RuleLaneId {
  if (status === 'active' || status === 'approved') {
    return 'active'
  }
  if (status === 'archived' || status === 'archive') {
    return 'archived'
  }
  return 'draft'
}

export function normalizeJobStatus(status: string): JobLaneId {
  if (status === 'done' || status === 'archived') {
    return status
  }
  return 'open'
}

export function normalizeLockedStatus(status: string): LockedLaneId {
  return status === 'archived' ? 'archived' : 'active'
}

export function normalizePinStatus(status: string): PinLaneId {
  return status === 'done' ? 'done' : 'todo'
}
