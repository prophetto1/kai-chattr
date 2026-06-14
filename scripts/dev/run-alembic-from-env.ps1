param(
  [ValidateSet("dev", "prod")]
  [string] $Environment = "dev",

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $AlembicArgs = @("upgrade", "head")
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "database-env.ps1")

Use-KaiChattrDatabaseUrl -Environment $Environment -RequireDirect

. (Join-Path $PSScriptRoot "api-uv-env.ps1")

Push-Location (Join-Path $RepoRoot "services\api")
try {
  & uv run alembic @AlembicArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
