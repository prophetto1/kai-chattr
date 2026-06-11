/**
 * Declared prototype fixtures for the agent-builder surfaces.
 * Typed by the v4 contract (agent-system-contract.ts). These are replaced by the
 * contract-bound API client when Plan 1b (agents registry) lands; until then the
 * surfaces label themselves as fixture-backed prototypes.
 */

import type { AgentDetail, EngineDefinition } from '@/lib/agent-system-contract'

export const ENGINE_CATALOG: EngineDefinition[] = [
  {
    engine_id: 'eng_claude_opus',
    engine_definition_version: '1',
    display_name: 'Claude Opus',
    family: 'claude',
    runtime_kind: 'local_cli',
    supported_homes: ['local', 'cloud'],
    context_window: 200_000,
    cost_metadata: { input_usd_per_mtok: 15, output_usd_per_mtok: 75 },
    capability_flags: ['extended_thinking', 'effort_levels', 'fast_mode'],
  },
  {
    engine_id: 'eng_claude_fable',
    engine_definition_version: '1',
    display_name: 'Claude Fable',
    family: 'claude',
    runtime_kind: 'local_cli',
    supported_homes: ['local', 'cloud'],
    context_window: 200_000,
    cost_metadata: { input_usd_per_mtok: 20, output_usd_per_mtok: 90 },
    capability_flags: ['extended_thinking', 'effort_levels'],
  },
  {
    engine_id: 'eng_gemini_31_pro',
    engine_definition_version: '1',
    display_name: 'Gemini 3.1 Pro',
    family: 'gemini',
    runtime_kind: 'local_cli',
    supported_homes: ['local', 'cloud'],
    context_window: 1_000_000,
    cost_metadata: { input_usd_per_mtok: 2.5, output_usd_per_mtok: 15 },
    capability_flags: ['extended_thinking'],
  },
  {
    engine_id: 'eng_gpt_55',
    engine_definition_version: '1',
    display_name: 'GPT-5.5 xhigh',
    family: 'gpt',
    runtime_kind: 'hosted_api',
    supported_homes: ['cloud'],
    context_window: 400_000,
    cost_metadata: { input_usd_per_mtok: 10, output_usd_per_mtok: 40 },
    capability_flags: ['effort_levels'],
  },
  {
    engine_id: 'eng_kimi_k2',
    engine_definition_version: '1',
    display_name: 'Kimi K2',
    family: 'kimi',
    runtime_kind: 'hosted_api',
    supported_homes: ['cloud'],
    context_window: 256_000,
    cost_metadata: { input_usd_per_mtok: 1, output_usd_per_mtok: 3 },
    capability_flags: [],
  },
  {
    engine_id: 'eng_qwen_max',
    engine_definition_version: '1',
    display_name: 'Qwen Max',
    family: 'qwen',
    runtime_kind: 'local_cli',
    supported_homes: ['local', 'cloud'],
    context_window: 262_000,
    cost_metadata: { input_usd_per_mtok: 1.6, output_usd_per_mtok: 6.4 },
    capability_flags: [],
  },
]

/** UI-only brand hue per engine family (not part of the v4 contract). */
export const ENGINE_FAMILY_COLORS: Record<string, string> = {
  claude: '#d97757',
  gemini: '#4e8cf7',
  gpt: '#10a37f',
  kimi: '#7c5cff',
  qwen: '#8f5cf7',
}

export function engineById(engineId: string) {
  return ENGINE_CATALOG.find((engine) => engine.engine_id === engineId)
}

const WORKSPACE = 'local'

export const AGENT_FIXTURES: AgentDetail[] = [
  {
    identity: {
      agent_public_id: 'ag_matt_fe',
      workspace_public_id: WORKSPACE,
      name: 'Matt',
      role: 'Front-end designer',
      persona:
        'Calm, detail-obsessed front-end designer. Prefers measured layout deltas over rewrites; argues in tokens and density metrics, not adjectives.',
      description: 'Owns workbench and settings surface design implementation.',
      icon: '🎨',
      accent_color: '#d97757',
      home: 'local',
      status: 'online',
      lifecycle_state: 'active',
    },
    version_number: 4,
    version_state: 'published',
    trust_profile: 'private',
    model_policy: {
      primary_engine_id: 'eng_claude_opus',
      engine_pinning: 'latest_in_family',
      subagent_engine_id: 'eng_qwen_max',
      reasoning_mode: 'adaptive',
      reasoning_effort: 'high',
      fast_mode_enabled: false,
      structured_output_required: true,
    },
    execution_policy: {
      mode: 'ask_first',
      max_turn_duration_seconds: 1800,
      max_steps_per_run: 80,
      max_tool_calls_per_run: 200,
      budget_limit_per_run_usd: 8,
      budget_limit_per_day_usd: 40,
      concurrency_limit: 1,
    },
    memory_policy: {
      profile: 'personal',
      individual_memory_enabled: true,
      collective_memory_enabled: true,
      collective_provider_id: 'postgres_pgvector',
      read_scope: 'workspace',
      write_scope: 'suggest_only',
      collective_contribution_on_delete: 'anonymize',
    },
    runtime: {
      home: 'local',
      state: 'running',
      local: {
        local_bridge_id: 'bridge_jon_desktop',
        slot_id: 'slot_01',
        slot_label: 'Slot 1 of 20',
        port_internal: 9501,
        local_home_ref: 'local_agents/ag_matt_fe/',
        pairing_state: 'paired',
        heartbeat_status: 'ok',
        wterm_session_id: 'wt_77ab12',
        process_status: 'running',
      },
    },
    counters: { tools: 9, skills: 4, integrations: 2, memories: 31, library_items: 3 },
    versions: [
      {
        version_id: 'agv_matt_4',
        version_number: 4,
        state: 'published',
        created_by: 'Jon',
        created_at: '2026-06-10T19:42:00Z',
        change_summary: 'Raised reasoning effort to high; bound design-tokens skill.',
      },
      {
        version_id: 'agv_matt_3',
        version_number: 3,
        state: 'superseded',
        created_by: 'ag_matt_fe (suggestion, approved)',
        created_at: '2026-06-08T11:05:00Z',
        change_summary: 'Prompt suggestion: prefer measured layout deltas.',
      },
      {
        version_id: 'agv_matt_2',
        version_number: 2,
        state: 'superseded',
        created_by: 'Jon',
        created_at: '2026-06-06T09:20:00Z',
        change_summary: 'Engine swap Gemini 3.1 Pro -> Claude Opus. Home and memory unchanged.',
      },
    ],
    activity: [
      { id: 'ev_m1', at: '2026-06-11T08:12:00Z', actor: 'ag_matt_fe', kind: 'run', summary: 'Run completed: settings rail typography pass (14 tool calls, $0.84).' },
      { id: 'ev_m2', at: '2026-06-10T19:42:00Z', actor: 'Jon', kind: 'version', summary: 'Published version 4.' },
      { id: 'ev_m3', at: '2026-06-10T16:03:00Z', actor: 'system', kind: 'system', summary: 'Heartbeat restored after relaunch (slot_01).' },
    ],
  },
  {
    identity: {
      agent_public_id: 'ag_iris_pm',
      workspace_public_id: WORKSPACE,
      name: 'Iris',
      role: 'Project manager',
      persona:
        'Decisive project manager. Keeps plans gated, scope explicit, and reports outcome-first. Allergic to improvised scope.',
      description: 'Coordinates plan lifecycles and worker handoffs.',
      icon: '📋',
      accent_color: '#4e8cf7',
      home: 'local',
      status: 'idle',
      lifecycle_state: 'active',
    },
    version_number: 2,
    version_state: 'published',
    trust_profile: 'team',
    model_policy: {
      primary_engine_id: 'eng_gemini_31_pro',
      engine_pinning: 'pinned',
      reasoning_mode: 'adaptive',
      reasoning_effort: 'medium',
      fast_mode_enabled: true,
      structured_output_required: true,
    },
    execution_policy: {
      mode: 'auto',
      max_turn_duration_seconds: 900,
      max_steps_per_run: 40,
      max_tool_calls_per_run: 80,
      budget_limit_per_run_usd: 3,
      concurrency_limit: 2,
    },
    memory_policy: {
      profile: 'team_learning',
      individual_memory_enabled: true,
      collective_memory_enabled: true,
      collective_provider_id: 'postgres_pgvector',
      read_scope: 'workspace',
      write_scope: 'suggest_only',
      collective_contribution_on_delete: 'anonymize',
    },
    runtime: {
      home: 'local',
      state: 'idle',
      local: {
        local_bridge_id: 'bridge_jon_desktop',
        slot_id: 'slot_02',
        slot_label: 'Slot 2 of 20',
        port_internal: 9502,
        local_home_ref: 'local_agents/ag_iris_pm/',
        pairing_state: 'paired',
        heartbeat_status: 'ok',
        process_status: 'idle',
      },
    },
    counters: { tools: 6, skills: 7, integrations: 3, memories: 54, library_items: 8 },
    versions: [
      {
        version_id: 'agv_iris_2',
        version_number: 2,
        state: 'published',
        created_by: 'Jon',
        created_at: '2026-06-09T14:30:00Z',
        change_summary: 'Trust profile widened to team; fast mode enabled.',
      },
    ],
    activity: [
      { id: 'ev_i1', at: '2026-06-11T07:55:00Z', actor: 'ag_iris_pm', kind: 'run', summary: 'Scheduled standup digest posted to #general.' },
      { id: 'ev_i2', at: '2026-06-09T14:30:00Z', actor: 'Jon', kind: 'version', summary: 'Published version 2.' },
    ],
  },
  {
    identity: {
      agent_public_id: 'ag_vera_fin',
      workspace_public_id: WORKSPACE,
      name: 'Vera',
      role: 'Financial analyst',
      persona:
        'Precise financial analyst. Cites sources, separates fact from estimate, and flags every assumption with a confidence level.',
      description: 'Cost tracking, usage roll-ups, and budget forecasting.',
      icon: '📊',
      accent_color: '#10a37f',
      home: 'cloud',
      status: 'online',
      lifecycle_state: 'active',
    },
    version_number: 1,
    version_state: 'published',
    trust_profile: 'curated',
    model_policy: {
      primary_engine_id: 'eng_gpt_55',
      engine_pinning: 'pinned',
      reasoning_effort: 'max',
      fast_mode_enabled: false,
      structured_output_required: true,
    },
    execution_policy: {
      mode: 'ask_first',
      max_turn_duration_seconds: 1200,
      max_steps_per_run: 60,
      max_tool_calls_per_run: 120,
      budget_limit_per_run_usd: 5,
      budget_limit_per_day_usd: 20,
      concurrency_limit: 1,
    },
    memory_policy: {
      profile: 'curated',
      individual_memory_enabled: true,
      collective_memory_enabled: true,
      collective_provider_id: 'postgres_pgvector',
      read_scope: 'linked',
      write_scope: 'suggest_only',
      collective_contribution_on_delete: 'retain',
    },
    runtime: {
      home: 'cloud',
      state: 'running',
      cloud: {
        namespace_key: 'ns_acme_7f3',
        hosted_runtime_id: 'rt_cloud_412',
        process_status: 'running',
      },
    },
    counters: { tools: 5, skills: 2, integrations: 4, memories: 19, library_items: 12 },
    versions: [
      {
        version_id: 'agv_vera_1',
        version_number: 1,
        state: 'published',
        created_by: 'Jon',
        created_at: '2026-06-07T10:00:00Z',
        change_summary: 'Initial provision (cloud namespace).',
      },
    ],
    activity: [
      { id: 'ev_v1', at: '2026-06-11T06:40:00Z', actor: 'ag_vera_fin', kind: 'run', summary: 'Weekly usage roll-up generated ($12.40 spend across 41 runs).' },
    ],
  },
  {
    identity: {
      agent_public_id: 'ag_sol_qa',
      workspace_public_id: WORKSPACE,
      name: 'Sol',
      role: 'Reviewer / QA',
      persona:
        'Adversarial reviewer. Tries to refute every claim before accepting it; default verdict is "not proven".',
      description: 'Plan evaluation, code review, and acceptance gating.',
      icon: '🔍',
      accent_color: '#b8893b',
      home: 'local',
      status: 'offline',
      lifecycle_state: 'suspended',
    },
    version_number: 3,
    version_state: 'published',
    trust_profile: 'private',
    model_policy: {
      primary_engine_id: 'eng_claude_fable',
      engine_pinning: 'latest_in_family',
      reasoning_mode: 'fixed',
      reasoning_effort: 'max',
      fast_mode_enabled: false,
      structured_output_required: true,
    },
    execution_policy: {
      mode: 'ask_first',
      max_turn_duration_seconds: 2400,
      max_steps_per_run: 100,
      max_tool_calls_per_run: 240,
      budget_limit_per_run_usd: 6,
      budget_limit_per_day_usd: 18,
      concurrency_limit: 1,
    },
    memory_policy: {
      profile: 'personal',
      individual_memory_enabled: true,
      collective_memory_enabled: false,
      collective_provider_id: 'postgres_pgvector',
      read_scope: 'linked',
      write_scope: 'none',
      collective_contribution_on_delete: 'purge',
    },
    runtime: {
      home: 'local',
      state: 'stale',
      local: {
        local_bridge_id: 'bridge_jon_desktop',
        slot_id: 'slot_03',
        slot_label: 'Slot 3 of 20',
        port_internal: 9503,
        local_home_ref: 'local_agents/ag_sol_qa/',
        pairing_state: 'paired',
        heartbeat_status: 'stale',
        process_status: 'stopped',
      },
    },
    counters: { tools: 7, skills: 5, integrations: 1, memories: 44, library_items: 2 },
    versions: [
      {
        version_id: 'agv_sol_3',
        version_number: 3,
        state: 'published',
        created_by: 'Jon',
        created_at: '2026-06-08T18:00:00Z',
        change_summary: 'Raised step budget for long evaluation passes.',
      },
    ],
    activity: [
      { id: 'ev_s1', at: '2026-06-10T22:14:00Z', actor: 'system', kind: 'policy', summary: 'Suspended: budget_limit_per_day reached mid-run (invariant 16). Breach written to run record and audit log.' },
      { id: 'ev_s2', at: '2026-06-10T21:50:00Z', actor: 'ag_sol_qa', kind: 'run', summary: 'Run halted at $18.00 daily budget during plan re-evaluation.' },
    ],
  },
]

export function agentByPublicId(agentPublicId: string) {
  return AGENT_FIXTURES.find((agent) => agent.identity.agent_public_id === agentPublicId)
}

export const TRUST_PROFILE_SUMMARIES: Record<string, string> = {
  private: 'Only you. Ask-first execution, suggest-only memory writes, low tool risk ceiling.',
  curated: 'Curated access. Ask-first for external writes, linked memory reads.',
  team: 'Workspace team. Auto execution within budgets, team-learning memory profile.',
  custom: 'Start from private defaults, then tune every policy in the console.',
}
