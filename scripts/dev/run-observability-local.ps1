param(
  [switch] $Recreate,
  [string] $Network = "kai-chattr-observability",
  [string] $JaegerContainer = "kai-chattr-jaeger",
  [string] $CollectorContainer = "kai-chattr-otel-collector",
  [string] $JaegerImage = "jaegertracing/all-in-one:1.76.0",
  [string] $CollectorImage = "otel/opentelemetry-collector-contrib:0.140.1",
  [int] $JaegerUiPort = 8886,
  [int] $OtelGrpcPort = 8837,
  [int] $OtelHttpPort = 8838,
  [string] $LogfireEndpoint = "https://logfire-us.pydantic.dev"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$CollectorConfig = Resolve-Path (Join-Path $RepoRoot "ops\otel\collector.local.yaml")
$EffectiveLogfireEndpoint = $env:LOGFIRE_OTLP_ENDPOINT
if ([string]::IsNullOrWhiteSpace($EffectiveLogfireEndpoint)) {
  $EffectiveLogfireEndpoint = $env:LOGFIRE_BASE_URL
}
if ([string]::IsNullOrWhiteSpace($EffectiveLogfireEndpoint)) {
  $EffectiveLogfireEndpoint = $LogfireEndpoint
}
if ([string]::IsNullOrWhiteSpace($env:LOGFIRE_TOKEN)) {
  throw "LOGFIRE_TOKEN is required for the kai-chattr dev observability loop. Run through SOPS, for example: sops exec-env secrets/dev/auth.yaml `"pnpm run observability:local:recreate`"."
}

function Test-DockerAvailable {
  & docker version | Out-Null
}

function Test-DockerNetwork([string] $Name) {
  $networks = & docker network ls --format "{{.Name}}"
  return $networks -contains $Name
}

function Test-DockerContainer([string] $Name) {
  $containers = & docker ps -a --format "{{.Names}}"
  return $containers -contains $Name
}

function Test-DockerPortBinding([string] $Name, [int] $ContainerPort, [int] $HostPort) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $bindings = & docker port $Name "$ContainerPort/tcp" 2>$null
  $dockerExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($dockerExitCode -ne 0) {
    return $false
  }
  if (-not $bindings) {
    return $false
  }
  foreach ($binding in $bindings) {
    if ($binding -match ":$HostPort$") {
      return $true
    }
  }
  return $false
}

function Start-ExistingContainer([string] $Name) {
  $running = & docker ps --format "{{.Names}}"
  if ($running -contains $Name) {
    return
  }
  & docker start $Name | Out-Null
}

function Remove-LocalContainer([string] $Name) {
  if (Test-DockerContainer $Name) {
    & docker rm -f $Name | Out-Null
  }
}

Test-DockerAvailable

if (-not (Test-DockerNetwork $Network)) {
  & docker network create $Network | Out-Null
}

if ($Recreate) {
  Remove-LocalContainer $CollectorContainer
  Remove-LocalContainer $JaegerContainer
}

if ((Test-DockerContainer $JaegerContainer) -and -not (Test-DockerPortBinding $JaegerContainer 16686 $JaegerUiPort)) {
  Remove-LocalContainer $JaegerContainer
}

if (
  (Test-DockerContainer $CollectorContainer) -and (
    -not (Test-DockerPortBinding $CollectorContainer $OtelGrpcPort $OtelGrpcPort) -or
    -not (Test-DockerPortBinding $CollectorContainer $OtelHttpPort $OtelHttpPort)
  )
) {
  Remove-LocalContainer $CollectorContainer
}

if (Test-DockerContainer $JaegerContainer) {
  Start-ExistingContainer $JaegerContainer
} else {
  & docker run -d `
    --name $JaegerContainer `
    --network $Network `
    -e COLLECTOR_OTLP_ENABLED=true `
    -e "OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:$OtelGrpcPort" `
    -p "$($JaegerUiPort):16686" `
    $JaegerImage `
    --collector.otlp.grpc.host-port=":$OtelGrpcPort" `
    --collector.otlp.http.host-port=":$OtelHttpPort" | Out-Null
}

Remove-LocalContainer $CollectorContainer
& docker run -d `
  --name $CollectorContainer `
  --network $Network `
  -e "LOGFIRE_TOKEN=$env:LOGFIRE_TOKEN" `
  -e "LOGFIRE_OTLP_ENDPOINT=$EffectiveLogfireEndpoint" `
  -p "$($OtelGrpcPort):$OtelGrpcPort" `
  -p "$($OtelHttpPort):$OtelHttpPort" `
  -v "$($CollectorConfig.Path):/etc/otelcol-contrib/config.yaml:ro" `
  $CollectorImage `
  --config /etc/otelcol-contrib/config.yaml | Out-Null

Write-Host "kai-chattr observability local loop is starting."
Write-Host "Jaeger UI: http://127.0.0.1:$JaegerUiPort"
Write-Host "OTLP HTTP traces: http://127.0.0.1:$OtelHttpPort/v1/traces"
Write-Host "OTLP gRPC: 127.0.0.1:$OtelGrpcPort"
Write-Host "Logfire OTLP endpoint: $EffectiveLogfireEndpoint"
Write-Host ""
Write-Host "API env:"
Write-Host '$env:OTEL_TRACES_EXPORTER = "otlp"'
Write-Host "`$env:OTEL_EXPORTER_OTLP_ENDPOINT = `"http://127.0.0.1:$OtelHttpPort/v1/traces`""
Write-Host '$env:OTEL_SERVICE_NAME = "kai-chattr-api"'
Write-Host '$env:LOGFIRE_ENABLED = "true"'
Write-Host ""
Write-Host "Logfire is SOPS-gated and exported by the local OpenTelemetry Collector. Do not write plaintext tokens."
