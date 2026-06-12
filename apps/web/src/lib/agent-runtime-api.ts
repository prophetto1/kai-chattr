import { chattrJson } from '@/lib/chattr-api'

export type AgentTransport = 'console' | 'pty'

export type AgentRuntimeConfig = {
  agent: string
  label: string
  transport: AgentTransport
  available_transports: AgentTransport[]
  effective_on_next_launch: boolean
}

export type AgentRuntimeConfigList = {
  agents: AgentRuntimeConfig[]
}

export function getAgentRuntimeConfigs() {
  return chattrJson<AgentRuntimeConfigList>('/api/agents/runtime-config')
}

export function setAgentTransport(agent: string, transport: AgentTransport) {
  return chattrJson<AgentRuntimeConfig>(
    `/api/agents/${encodeURIComponent(agent)}/runtime-config`,
    {
      body: JSON.stringify({ transport }),
      method: 'PUT',
    }
  )
}

/** Launcher profile ids are `agent.<name>[.variant]`; the config agent is the second segment. */
export function agentNameFromProfileId(profileId: string): string | null {
  const parts = profileId.split('.')
  if (parts[0] !== 'agent' || !parts[1]) {
    return null
  }
  return parts[1]
}
