param(
  [ValidateSet("dev", "prod")]
  [string] $Environment = "dev"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "database-env.ps1")

Use-KaiChattrDatabaseUrl -Environment $Environment

. (Join-Path $PSScriptRoot "api-uv-env.ps1")

Push-Location (Join-Path $RepoRoot "services\api")
try {
  & uv run python -m app.cli
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
