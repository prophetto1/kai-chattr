/**
 * Contract-bound API helpers (endpoint-contracts governance, rule
 * "registry-backed-observability").
 *
 * Product code calls these typed helpers; raw `chattrJson('/api/...')`
 * literals are low-level transport reserved for `chattr-api.ts` and the
 * existing `lib/*-api.ts` compatibility modules (the boundary test in
 * scripts/tests enforces this).
 */

import { chattrJson } from '@/lib/chattr-api'

export type EndpointContractMetadata = {
  area: string
  auth: string
  canonical_status: 'canonical' | 'legacy' | 'internal' | 'redirect_helper'
  data_owner: string
  method: string
  operation: string
  path: string
  proxy: string
  purpose: string
  request_model: string
  response_model: string
  route_name: string
  scope: 'public' | 'user' | 'workspace' | 'workspace_session' | 'runtime' | 'global'
  span_name: string
  surface: string
}

export type EndpointContractCoverage = {
  total_routes: number
  contracted_routes: number
  uncontracted_routes: string[]
  orphan_contracts: string[]
}

export type ObservabilityStatus = {
  status: string
  service_name: string
  logfire_configured: boolean
  logfire_enabled: boolean
  observability_stack: string[]
  otel_exporter_otlp_endpoint: string
  otel_jaeger_ui_url: string
  otel_service_name: string
  otel_traces_exporter: string
}

export function getObservabilityStatus() {
  return chattrJson<ObservabilityStatus>('/observability/status')
}

export function getObservedEndpoints() {
  return chattrJson<EndpointContractMetadata[]>('/observability/endpoints')
}

export function getEndpointContractCoverage() {
  return chattrJson<EndpointContractCoverage>('/schemas/endpoint-contracts/status')
}
