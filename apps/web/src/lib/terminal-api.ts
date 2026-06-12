import { chattrJson } from '@/lib/chattr-api'

export type TerminalSnapshot = {
  name: string
  text: string
  rows?: number | null
  cols?: number | null
  captured_at?: number | null
  received_at?: number | null
}

export type TerminalSnapshotResponse = {
  ok: boolean
  name: string
  snapshot: TerminalSnapshot | null
}

export function getTerminalSnapshot(agentName: string) {
  return chattrJson<TerminalSnapshotResponse>(
    `/api/terminal/${encodeURIComponent(agentName)}`
  )
}

export type AgentRuntimeCard = {
  name: string
  registered: boolean
  has_snapshot: boolean
  snapshot_age_ms: number
  approval_needed: boolean
  approval_hint: string
  screen_tail: string
}

export type TerminalRuntimesResponse = {
  ok: boolean
  agents: AgentRuntimeCard[]
  pending_approvals: number
}

export function getTerminalRuntimes() {
  return chattrJson<TerminalRuntimesResponse>('/api/terminal-runtimes')
}

/** Raw keystroke lane: text + Enter delivered verbatim to the agent's PTY. */
export function sendTerminalInput(agentName: string, keys: string) {
  return chattrJson<{ ok: boolean; name: string }>(
    `/api/terminal/${encodeURIComponent(agentName)}/input`,
    { body: JSON.stringify({ keys }), method: 'POST' }
  )
}
