import { chattrJson } from '@/lib/chattr-api'

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
