import { chattrApiUrl, chattrJson, getSessionToken } from '@/lib/chattr-api'

export type TerminalSessionInfo = {
  terminal_id: string
  pid: number
  shell: string
  cols: number
  rows: number
  alive: boolean
}

export type TerminalSessionList = {
  ok: boolean
  sessions: TerminalSessionInfo[]
}

/** Build the /ws/terminals URL the same way the room /ws client does. */
export function terminalSocketUrl(shell?: string) {
  const token = getSessionToken()
  const query = new URLSearchParams({ token })
  if (shell) {
    query.set('shell', shell)
  }
  const base = window.location.href
  const url = new URL(chattrApiUrl(`/ws/terminals?${query.toString()}`), base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function listTerminals() {
  return chattrJson<TerminalSessionList>('/api/terminals')
}
