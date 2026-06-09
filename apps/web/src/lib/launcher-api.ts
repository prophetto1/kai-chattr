import { chattrJson } from '@/lib/chattr-api'

export type AgentLauncherChecks = {
  uv: boolean
  wrapper: boolean
  provider_cli: boolean
}

export type AgentLauncherProfile = {
  profile_id: string
  kind: string
  description: string
  base: string
  label: string
  visible_terminal: boolean
  requires_explicit_confirmation: boolean
  ready: boolean
  blocked_reason: string | null
  checks: AgentLauncherChecks
}

export type AgentLauncherPreflight = {
  runtime: {
    api_port: number
    mcp_http_port: number
    mcp_sse_port: number
  }
  profiles: AgentLauncherProfile[]
}

export type AgentLauncherStartResult = {
  profile_id: string
  accepted: boolean
  detail: string
  pid: number | null
  expected_base: string
  registration_deadline_ms: number
}

export function getAgentLauncherPreflight() {
  return chattrJson<AgentLauncherPreflight>('/api/launchers/agent/preflight')
}

export function startAgentLauncher(profileId: string, confirmRisky = false) {
  return chattrJson<AgentLauncherStartResult>('/api/launchers/agent', {
    body: JSON.stringify({
      confirm_risky: confirmRisky,
      profile_id: profileId,
    }),
    method: 'POST',
  })
}
