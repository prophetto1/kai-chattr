/**
 * Frontend projection of the locked agent-system v4 contract.
 * Mirrors docs/schema/final-schema-v4.json (kai-chattr.agent-system.spec 4.0.0).
 * Field names follow the contract exactly; this file must not invent shapes the
 * schema lacks. The backend registry (Plan 1b / Slice 2) becomes the source of
 * these values; until then surfaces render declared fixtures typed by this file.
 */

export type AgentLifecycleState = 'draft' | 'active' | 'suspended' | 'archived' | 'deleted'
export type AgentHome = 'local' | 'cloud'
export type AgentStatus = 'online' | 'idle' | 'offline'
export type TrustProfileName = 'private' | 'curated' | 'team' | 'custom'
export type ExecutionMode = 'auto' | 'ask_first' | 'manual'
export type EnginePinning = 'pinned' | 'latest_in_family'
export type MemoryProfile = 'personal' | 'curated' | 'team_learning' | 'custom'
export type MemoryReadScope = 'none' | 'linked' | 'workspace' | 'all_allowed'
export type MemoryWriteScope = 'none' | 'suggest_only' | 'auto_save'
export type CollectiveContributionOnDelete = 'purge' | 'anonymize' | 'retain'
export type RuntimeSlotState =
  | 'free'
  | 'allocated'
  | 'paired'
  | 'running'
  | 'idle'
  | 'stale'
  | 'freed'
export type AgentVersionState = 'editing' | 'snapshot' | 'tested' | 'published' | 'superseded'

export type EngineDefinition = {
  engine_id: string
  engine_definition_version: string
  display_name: string
  family: 'claude' | 'gemini' | 'gpt' | 'qwen' | 'kimi' | (string & {})
  runtime_kind: 'hosted_api' | 'local_cli' | 'container'
  supported_homes: AgentHome[]
  context_window: number
  cost_metadata: {
    input_usd_per_mtok?: number
    output_usd_per_mtok?: number
  }
  capability_flags: string[]
}

export type AgentModelPolicy = {
  primary_engine_id: string
  engine_pinning: EnginePinning
  fallback_engine_id?: string
  subagent_engine_id?: string
  reasoning_mode?: 'off' | 'adaptive' | 'fixed'
  reasoning_effort?: 'low' | 'medium' | 'high' | 'max'
  fast_mode_enabled: boolean
  max_output_tokens?: number
  structured_output_required: true
}

export type AgentExecutionPolicy = {
  mode: ExecutionMode
  max_turn_duration_seconds: number
  max_steps_per_run: number
  max_tool_calls_per_run: number
  budget_limit_per_run_usd: number
  budget_limit_per_day_usd?: number
  concurrency_limit: number
}

export type AgentMemoryPolicy = {
  profile: MemoryProfile
  individual_memory_enabled: boolean
  collective_memory_enabled: boolean
  collective_provider_id: string
  read_scope: MemoryReadScope
  write_scope: MemoryWriteScope
  collective_contribution_on_delete: CollectiveContributionOnDelete
}

export type AgentIdentity = {
  agent_public_id: string
  workspace_public_id: string
  name: string
  role: string
  persona: string
  description: string
  icon: string
  accent_color: string
  home: AgentHome
  status: AgentStatus
  lifecycle_state: AgentLifecycleState
}

export type LocalRuntimeBinding = {
  local_bridge_id: string
  slot_id: string
  /** User-facing slot label ("Slot 1 of 20"); port stays diagnostics-only. */
  slot_label: string
  port_internal: number
  local_home_ref: string
  pairing_state: 'unpaired' | 'pairing' | 'paired'
  heartbeat_status: 'ok' | 'missed' | 'stale'
  wterm_session_id?: string
  process_status: string
}

export type CloudRuntimeBinding = {
  namespace_key: string
  hosted_runtime_id: string
  process_status: string
}

export type RuntimeBinding = {
  home: AgentHome
  state: RuntimeSlotState
  local?: LocalRuntimeBinding
  cloud?: CloudRuntimeBinding
}

export type AgentVersionSummary = {
  version_id: string
  version_number: number
  state: AgentVersionState
  created_by: string
  created_at: string
  change_summary: string
}

export type AgentActivityEvent = {
  id: string
  at: string
  actor: string
  kind: 'run' | 'version' | 'policy' | 'system'
  summary: string
}

export type AgentCapabilityCounters = {
  tools: number
  skills: number
  integrations: number
  memories: number
  library_items: number
}

export type AgentDetail = {
  identity: AgentIdentity
  version_number: number
  version_state: AgentVersionState
  trust_profile: TrustProfileName
  model_policy: AgentModelPolicy
  execution_policy: AgentExecutionPolicy
  memory_policy: AgentMemoryPolicy
  runtime: RuntimeBinding
  counters: AgentCapabilityCounters
  versions: AgentVersionSummary[]
  activity: AgentActivityEvent[]
}

export const AGENT_CONSOLE_TABS = [
  'overview',
  'identity',
  'runtime',
  'model',
  'capabilities',
  'invocations',
  'memory',
  'access',
  'versions',
  'activity',
] as const

export type AgentConsoleTab = (typeof AGENT_CONSOLE_TABS)[number]

/**
 * Reserved v1.5 contract (entities.agentHomeMigration in final-schema-v4.json).
 * No surface renders this yet; typed now so adding the migration UI later is
 * not a contract break.
 */
export type AgentHomeMigrationStatus =
  | 'reserved'
  | 'pending'
  | 'exporting'
  | 'importing'
  | 'verifying'
  | 'complete'
  | 'failed'
