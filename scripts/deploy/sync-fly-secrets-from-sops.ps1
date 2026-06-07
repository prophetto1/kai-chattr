param(
  [ValidateSet("dev", "prod")]
  [string] $Environment = "dev"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Import-SopsJson {
  param([string] $Path)

  $json = & sops -d --output-type json $Path
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  return ($json | Out-String | ConvertFrom-Json)
}

$fly = Import-SopsJson (Join-Path $RepoRoot "secrets\dev\fly.yaml")
$neon = Import-SopsJson (Join-Path $RepoRoot "secrets\dev\neon.yaml")
$auth = Import-SopsJson (Join-Path $RepoRoot "secrets\dev\auth.yaml")

$env:FLY_API_TOKEN = $fly.FLY_API_TOKEN
$env:NEON_DEV_DATABASE_URL = $neon.NEON_DEV_DATABASE_URL
$env:NEON_DEV_DIRECT_DATABASE_URL = $neon.NEON_DEV_DIRECT_DATABASE_URL
$env:NEON_PROD_DATABASE_URL = $neon.NEON_PROD_DATABASE_URL
$env:NEON_PROD_DIRECT_DATABASE_URL = $neon.NEON_PROD_DIRECT_DATABASE_URL
$env:KAI_CHATTR_SESSION_TOKEN = $auth.KAI_CHATTR_SESSION_TOKEN

if (-not $env:KAI_CHATTR_SESSION_TOKEN) {
  throw "Missing KAI_CHATTR_SESSION_TOKEN in secrets/dev/auth.yaml."
}

& (Join-Path $PSScriptRoot "sync-fly-secrets.ps1") -Environment $Environment
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
