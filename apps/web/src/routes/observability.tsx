'use client'

import { type ComponentType, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  IconActivityHeartbeat,
  IconCode,
  IconExternalLink,
  IconFileText,
  IconTerminal2,
  IconWorld,
} from '@tabler/icons-react'

import { AppShell } from '@/components/layout/AppShell'
import { KaiAppRail } from '@/components/layout/KaiAppRail'
import { Sheet } from '@/components/layout/Sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  getEndpointContractCoverage,
  getObservedEndpoints,
  getObservabilityStatus,
  type ObservedEndpoint,
  type ObservabilityStatus,
} from '@/lib/observability-api'
import { cn } from '@/lib/cn'

type ObservabilityIcon = ComponentType<{
  size?: number | string
  stroke?: number
  className?: string
}>

type ObservabilitySection = {
  description: string
  icon: ObservabilityIcon
  id: 'api' | 'openapi' | 'logfire' | 'browser'
  label: string
  status: 'live' | 'spec' | 'gated' | 'local'
}

const observabilitySections = [
  {
    id: 'api',
    label: 'API',
    description: 'Runtime exporter, service, endpoint, and trace pipeline health.',
    icon: IconActivityHeartbeat,
    status: 'live',
  },
  {
    id: 'openapi',
    label: 'OpenAPI',
    description: 'FastAPI schema and observed endpoint catalog for kai-chattr runtime routes.',
    icon: IconFileText,
    status: 'spec',
  },
  {
    id: 'logfire',
    label: 'Logfire',
    description: 'SOPS-gated cloud trace export state for the local observability loop.',
    icon: IconCode,
    status: 'gated',
  },
  {
    id: 'browser',
    label: 'Browser',
    description: 'Frontend proxy, local ports, and browser access points for telemetry.',
    icon: IconWorld,
    status: 'local',
  },
] satisfies ObservabilitySection[]

type ObservabilitySectionId = (typeof observabilitySections)[number]['id']

const observabilityGroups: Array<{
  label: string
  sectionIds: ObservabilitySectionId[]
}> = [
  {
    label: 'Runtime',
    sectionIds: ['api', 'openapi', 'logfire', 'browser'],
  },
]

const sectionById = new Map(observabilitySections.map((section) => [section.id, section]))

const observabilityHeaderBaseClass =
  'flex shrink-0 items-center gap-2.5 border-b border-border py-3'
const observabilityHeaderIconClass =
  'flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-muted ring-1 ring-border/50'
const observabilityHeaderTitleClass = 'truncate text-[13px] font-semibold leading-tight'
const observabilityHeaderDescriptionClass = 'truncate text-[11px] text-muted-foreground'

type ObservabilityModel = {
  endpoint: string
  exporter: string
  jaegerUrl: string
  logfireLabel: string
  serviceName: string
  stackLabel: string
  statusLabel: string
  statusTone: 'default' | 'outline'
}

function getObservabilityModel({
  isError,
  isLoading,
  status,
}: {
  isError: boolean
  isLoading: boolean
  status?: ObservabilityStatus
}): ObservabilityModel {
  const exporter =
    status?.otel_traces_exporter?.trim() ||
    (isError ? 'unavailable' : isLoading ? 'loading' : 'unknown')
  const serviceName = status?.otel_service_name?.trim() || status?.service_name?.trim() || 'kai-chattr-api'
  const endpoint = status?.otel_exporter_otlp_endpoint?.trim() || ''
  const jaegerUrl = status?.otel_jaeger_ui_url?.trim() || 'http://127.0.0.1:8886'
  const logfireLabel = status?.logfire_configured
    ? 'Configured'
    : status?.logfire_enabled
      ? 'Token missing'
      : 'SOPS-gated'
  const statusLabel = status?.status === 'active'
    ? 'Running'
    : isError
      ? 'Unavailable'
      : isLoading
        ? 'Loading'
        : 'Unknown'
  const stackLabel =
    status?.observability_stack?.length
      ? status.observability_stack.join(' -> ')
      : 'opentelemetry -> otel-collector -> jaeger -> logfire'

  return {
    endpoint,
    exporter,
    jaegerUrl,
    logfireLabel,
    serviceName,
    stackLabel,
    statusLabel,
    statusTone: status?.status === 'active' ? 'default' : 'outline',
  }
}

function SectionStatusBadge({ status }: { status: ObservabilitySection['status'] }) {
  const label = {
    gated: 'Gated',
    live: 'Live',
    local: 'Local',
    spec: 'Spec',
  }[status]

  return (
    <Badge
      className={cn(
        'ml-auto rounded-[5px] px-1.5 py-0 text-[10px] font-medium',
        status === 'live'
          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
          : 'border-border/50 bg-muted/50 text-muted-foreground'
      )}
      variant="outline"
    >
      {label}
    </Badge>
  )
}

function ObservabilityNavigation() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn(observabilityHeaderBaseClass, 'px-3.5')}>
        <span className={cn(observabilityHeaderIconClass, 'text-foreground')}>
          <IconActivityHeartbeat className="size-4" />
        </span>
        <div className="min-w-0">
          <h1 className={observabilityHeaderTitleClass}>Observability</h1>
          <p className={observabilityHeaderDescriptionClass}>Runtime signals</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
        <TabsList
          aria-label="Observability sections"
          className="flex h-auto w-full flex-col items-stretch justify-start gap-4 bg-transparent p-2.5"
        >
          {observabilityGroups.map((group) => (
            <div className="flex w-full flex-col gap-0.5" key={group.label}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </div>
              {group.sectionIds.map((sectionId) => {
                const section = sectionById.get(sectionId)
                if (!section) return null

                const SectionIcon = section.icon

                return (
                  <TabsTrigger
                    className="kai-category-rail-trigger h-auto min-h-9 w-full justify-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left data-[state=active]:bg-accent data-[state=active]:shadow-none active:scale-[0.99]"
                    key={section.id}
                    value={section.id}
                  >
                    <SectionIcon className="size-[15px] shrink-0 text-muted-foreground" />
                    <span className="truncate">{section.label}</span>
                    <SectionStatusBadge status={section.status} />
                  </TabsTrigger>
                )
              })}
            </div>
          ))}
        </TabsList>
      </ScrollArea>
    </div>
  )
}

function ObservabilityHeader({ section }: { section: ObservabilitySection }) {
  const SectionIcon = section.icon

  return (
    <header className={cn(observabilityHeaderBaseClass, 'px-6')}>
      <span className={observabilityHeaderIconClass}>
        <SectionIcon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <h2 className={observabilityHeaderTitleClass}>{section.label}</h2>
        <p className={observabilityHeaderDescriptionClass}>{section.description}</p>
      </div>
    </header>
  )
}

function ObservabilityPanel({
  children,
  eyebrow,
  title,
}: {
  children: ReactNode
  eyebrow?: string
  title: string
}) {
  return (
    <section className="overflow-hidden rounded-[10px] border border-border bg-card">
      <div className="px-5 py-3.5">
        {eyebrow ? (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <Separator className="bg-border" />
      <div className="divide-y divide-border">{children}</div>
    </section>
  )
}

function ObservabilityRow({
  action,
  description,
  label,
}: {
  action?: ReactNode
  description?: string
  label: string
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {description ? (
          <p className="mt-1 max-w-[58ch] text-[11.5px] leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

function TelemetryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[7px] border border-border bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-[13px] font-semibold text-foreground">{value}</div>
    </div>
  )
}

function ApiObservabilityPanel({ model }: { model: ObservabilityModel }) {
  const endpointQuery = useQuery({
    queryKey: ['observability-endpoints'],
    queryFn: getObservedEndpoints,
    refetchInterval: 30000,
    staleTime: 10000,
  })
  const endpoints = endpointQuery.data ?? []

  return (
    <div className="grid gap-5">
      <ObservabilityPanel eyebrow="Runtime telemetry" title="API signal flow">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={model.statusTone}>{model.statusLabel}</Badge>
            <Badge variant="outline">{model.exporter}</Badge>
          </div>
          <p className="mt-2 text-[11.5px] leading-5 text-muted-foreground">
            Collector path: {model.stackLabel}. Service {model.serviceName}
            {model.endpoint ? ` exports to ${model.endpoint}.` : ' has no OTLP endpoint configured.'}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <TelemetryMetric label="Service" value={model.serviceName} />
            <TelemetryMetric label="otel_traces_exporter" value={model.exporter} />
            <TelemetryMetric label="OTLP endpoint" value={model.endpoint || 'Not configured'} />
            <TelemetryMetric label="Jaeger UI" value={model.jaegerUrl} />
            <TelemetryMetric label="Logfire" value={model.logfireLabel} />
          </div>
        </div>
        <ObservabilityRow
          description={`Trace listing is reserved for the collector reader surface. Current exporter: ${model.exporter}.`}
          label="Recent backend spans"
        />
      </ObservabilityPanel>

      <ObservabilityPanel eyebrow="Endpoint contract" title="Runtime API definitions">
        <div className="px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{endpoints.length} routes</Badge>
            {endpointQuery.isError ? <Badge variant="outline">Unavailable</Badge> : null}
          </div>
          {endpointQuery.isError ? (
            <p className="text-[11.5px] leading-5 text-destructive">
              {endpointQuery.error instanceof Error ? endpointQuery.error.message : 'Endpoint catalog unavailable.'}
            </p>
          ) : (
            <EndpointContractTable endpoints={endpoints} loading={endpointQuery.isLoading && !endpointQuery.data} />
          )}
        </div>
      </ObservabilityPanel>
    </div>
  )
}

function EndpointContractTable({
  endpoints,
  loading,
}: {
  endpoints: ObservedEndpoint[]
  loading: boolean
}) {
  if (loading) {
    return <div className="text-[11.5px] text-muted-foreground">Loading endpoint contract...</div>
  }

  if (!endpoints.length) {
    return <div className="text-[11.5px] text-muted-foreground">No endpoint definitions returned.</div>
  }

  return (
    <div className="overflow-x-auto rounded-[7px] border border-border">
      <table className="min-w-[1040px] border-collapse text-left text-[11.5px]">
        <thead className="bg-muted/30 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Method</th>
            <th className="px-3 py-2 font-medium">Path</th>
            <th className="px-3 py-2 font-medium">Auth</th>
            <th className="px-3 py-2 font-medium">Scope</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Data owner</th>
            <th className="px-3 py-2 font-medium">Models (req → res)</th>
            <th className="px-3 py-2 font-medium">Surface</th>
            <th className="px-3 py-2 font-medium">Span</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {endpoints.map((endpoint) => (
            <tr key={`${endpoint.method} ${endpoint.path}`}>
              <td className="px-3 py-2">
                <Badge variant="outline">{endpoint.method}</Badge>
              </td>
              <td className="px-3 py-2 font-mono text-foreground">{endpoint.path}</td>
              <td className="px-3 py-2 text-muted-foreground">{endpoint.auth}</td>
              <td className="px-3 py-2 text-muted-foreground">{endpoint.scope}</td>
              <td className="px-3 py-2">
                <Badge variant={endpoint.canonical_status === 'canonical' ? 'secondary' : 'outline'}>
                  {endpoint.canonical_status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{endpoint.data_owner}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">
                {endpoint.request_model} → {endpoint.response_model}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{endpoint.surface}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{endpoint.span_name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function OpenApiObservabilityPanel() {
  const coverageQuery = useQuery({
    queryFn: getEndpointContractCoverage,
    queryKey: ['endpoint-contract-coverage'],
  })
  const coverage = coverageQuery.data

  return (
    <div className="grid gap-5">
      <ObservabilityPanel eyebrow="Schema" title="OpenAPI and observed endpoints">
        <ObservabilityRow
          action={(
            <Badge variant={coverage && coverage.uncontracted_routes.length === 0 ? 'secondary' : 'destructive'}>
              {coverage
                ? `${coverage.contracted_routes}/${coverage.total_routes} contracted`
                : coverageQuery.isLoading
                  ? 'loading…'
                  : 'unavailable'}
            </Badge>
          )}
          description="Every safe route owns one explicit contract (auth, scope, canonical status, data owner). Source: /schemas/endpoint-contracts/status."
          label="Endpoint contract coverage"
        />
        <ObservabilityRow
          action={(
            <Button asChild size="sm" type="button" variant="secondary">
              <a href="/openapi.json" rel="noreferrer" target="_blank">
                <IconExternalLink className="size-4" />
                JSON
              </a>
            </Button>
          )}
          description="FastAPI publishes the runtime route contract through /openapi.json. Runtime tests assert observability routes stay in the schema."
          label="OpenAPI document"
        />
        <ObservabilityRow
          action={(
            <Button asChild size="sm" type="button" variant="secondary">
              <a href="/docs" rel="noreferrer" target="_blank">
                <IconExternalLink className="size-4" />
                Docs
              </a>
            </Button>
          )}
          description="Swagger UI remains a backend-owned inspection surface, not a copied JWC docs page."
          label="Interactive API docs"
        />
        <ObservabilityRow
          action={<Badge variant="outline">/observability/endpoints</Badge>}
          description="The backend owns the observed endpoint catalog used by contract tests and runtime visibility."
          label="Endpoint catalog"
        />
      </ObservabilityPanel>
    </div>
  )
}

function LogfireObservabilityPanel({ model }: { model: ObservabilityModel }) {
  return (
    <div className="grid gap-5">
      <ObservabilityPanel eyebrow="Cloud traces" title="Logfire export">
        <ObservabilityRow
          action={<Badge variant={model.logfireLabel === 'Configured' ? 'default' : 'outline'}>{model.logfireLabel}</Badge>}
          description="Logfire export is enabled through the SOPS-backed local observability loop. Plaintext tokens do not belong in source files."
          label="Configuration"
        />
        <ObservabilityRow
          description="The local collector defaults to the Pydantic Logfire OTLP endpoint and allows an environment override through the SOPS command."
          label="OTLP target"
        />
        <ObservabilityRow
          action={<Badge variant="outline">pnpm run observability:local</Badge>}
          description="Start the local collector and Jaeger containers through the repo script so the same token and port contract is used every time."
          label="Local loop"
        />
      </ObservabilityPanel>
    </div>
  )
}

function BrowserObservabilityPanel({ model }: { model: ObservabilityModel }) {
  return (
    <div className="grid gap-5">
      <ObservabilityPanel eyebrow="Browser access" title="Frontend telemetry surfaces">
        <ObservabilityRow
          action={<Badge variant="outline">/observability/status</Badge>}
          description="The web app reads backend observability status through the Vite and Cloudflare proxy surface."
          label="Status API"
        />
        <ObservabilityRow
          action={(
            <Button asChild size="sm" type="button" variant="secondary">
              <a href={model.jaegerUrl} rel="noreferrer" target="_blank">
                <IconExternalLink className="size-4" />
                Jaeger
              </a>
            </Button>
          )}
          description="Local Jaeger is exposed on the kai-chattr dev port band, currently 8886."
          label="Trace browser"
        />
        <ObservabilityRow
          action={<Badge variant="outline">{'8800 -> 8840'}</Badge>}
          description="The Vite app stays on 8800 while API, observability, uploads, and WebSocket traffic proxy to the FastAPI runtime."
          label="Local routing"
        />
        <ObservabilityRow
          action={<IconTerminal2 className="size-4 text-muted-foreground" />}
          description="The status route reports the same exporter shown in the compact workbench status utility."
          label={`Exporter: ${model.exporter}`}
        />
      </ObservabilityPanel>
    </div>
  )
}

function ObservabilityContent({
  model,
  sectionId,
}: {
  model: ObservabilityModel
  sectionId: ObservabilitySectionId
}) {
  switch (sectionId) {
    case 'api':
      return <ApiObservabilityPanel model={model} />
    case 'openapi':
      return <OpenApiObservabilityPanel />
    case 'logfire':
      return <LogfireObservabilityPanel model={model} />
    case 'browser':
    default:
      return <BrowserObservabilityPanel model={model} />
  }
}

export default function ObservabilityPage() {
  const observabilityStatusQuery = useQuery({
    queryKey: ['observability-status'],
    queryFn: getObservabilityStatus,
    refetchInterval: 15000,
    staleTime: 5000,
  })
  const model = getObservabilityModel({
    isError: observabilityStatusQuery.isError,
    isLoading: observabilityStatusQuery.isLoading,
    status: observabilityStatusQuery.data,
  })

  return (
    <AppShell
      rail={<KaiAppRail activeItem="observability" />}
    >
      <Tabs
        className="flex min-h-0 flex-1 flex-col gap-0"
        defaultValue="api"
        orientation="vertical"
      >
        <section className="flex min-h-0 flex-1 flex-col gap-[5px] md:flex-row">
          <Sheet className="max-h-[42vh] w-full shrink-0 md:max-h-none md:w-[244px]">
            <ObservabilityNavigation />
          </Sheet>

          <Sheet className="min-h-0 min-w-0 flex-1">
            {observabilitySections.map((section) => (
              <TabsContent
                className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
                key={section.id}
                value={section.id}
              >
                <ObservabilityHeader section={section} />
                <ScrollArea className="min-h-0 flex-1" viewportClassName="min-h-0">
                  <div className="mx-auto grid w-full max-w-[1000px] gap-5 px-6 py-7">
                    <ObservabilityContent model={model} sectionId={section.id} />
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Sheet>
        </section>
      </Tabs>
    </AppShell>
  )
}
