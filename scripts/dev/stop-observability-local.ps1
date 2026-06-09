param(
  [string] $JaegerContainer = "kai-chattr-jaeger",
  [string] $CollectorContainer = "kai-chattr-otel-collector"
)

$ErrorActionPreference = "Stop"

function Stop-LocalContainer([string] $Name) {
  $running = & docker ps --format "{{.Names}}"
  if ($running -contains $Name) {
    & docker stop $Name | Out-Null
  }
}

Stop-LocalContainer $CollectorContainer
Stop-LocalContainer $JaegerContainer

Write-Host "kai-chattr observability local containers stopped."
