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
