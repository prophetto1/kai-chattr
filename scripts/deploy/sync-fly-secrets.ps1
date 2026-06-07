param(
  [ValidateSet("dev", "prod")]
  [string] $Environment = "dev"
)

$ErrorActionPreference = "Stop"

$app = if ($Environment -eq "prod") { "kai-chattr-api" } else { "kai-chattr-api-dev" }
$databaseUrlName = if ($Environment -eq "prod") {
  "NEON_PROD_DATABASE_URL"
} else {
  "NEON_DEV_DATABASE_URL"
}
$migrationUrlName = if ($Environment -eq "prod") {
  "NEON_PROD_DIRECT_DATABASE_URL"
} else {
  "NEON_DEV_DIRECT_DATABASE_URL"
}

if (-not $env:FLY_API_TOKEN) {
  throw "Missing FLY_API_TOKEN. Run through secrets/dev/fly.yaml with sops exec-env."
}

$databaseUrl = [Environment]::GetEnvironmentVariable($databaseUrlName, "Process")
$migrationUrl = [Environment]::GetEnvironmentVariable($migrationUrlName, "Process")
if (-not $databaseUrl) {
  throw "Missing $databaseUrlName. Run through secrets/dev/neon.yaml with sops exec-env."
}
if (-not $migrationUrl) {
  throw "Missing $migrationUrlName. Run through secrets/dev/neon.yaml with sops exec-env."
}
if ($migrationUrl -match "-pooler\.") {
  throw "$migrationUrlName must be a direct Neon URL, not a pooled URL."
}

$sessionToken = $env:KAI_CHATTR_SESSION_TOKEN
if (-not $sessionToken) {
  throw "Missing KAI_CHATTR_SESSION_TOKEN. Run through secrets/dev/auth.yaml with sops exec-env."
}

$env:KAI_CHATTR_DATABASE_URL = $databaseUrl
$env:KAI_CHATTR_MIGRATION_DATABASE_URL = $migrationUrl
$env:KAI_CHATTR_SESSION_TOKEN = $sessionToken

& flyctl secrets set `
  -a $app `
  --stage `
  "KAI_CHATTR_DATABASE_URL=$databaseUrl" `
  "KAI_CHATTR_MIGRATION_DATABASE_URL=$migrationUrl" `
  "KAI_CHATTR_SESSION_TOKEN=$sessionToken"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Output "Staged Fly secrets for $app."
