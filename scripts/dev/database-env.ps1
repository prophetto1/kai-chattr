function Use-KaiChattrDatabaseUrl {
  param(
    [ValidateSet("dev", "prod")]
    [string] $Environment = "dev",
    [switch] $RequireDirect
  )

  if ($env:KAI_CHATTR_DATABASE_URL) {
    if ($RequireDirect -and $env:KAI_CHATTR_DATABASE_URL -match "-pooler\.") {
      throw "Alembic migrations require a direct Neon connection URL, not a pooled -pooler URL."
    }
    $env:KAI_CHATTR_DATABASE_MODE = "postgres"
    return
  }

  $sourceName = if ($Environment -eq "prod") {
    if ($RequireDirect) { "NEON_PROD_DIRECT_DATABASE_URL" } else { "NEON_PROD_DATABASE_URL" }
  } else {
    if ($RequireDirect) { "NEON_DEV_DIRECT_DATABASE_URL" } else { "NEON_DEV_DATABASE_URL" }
  }

  $value = [Environment]::GetEnvironmentVariable($sourceName, "Process")
  if (-not $value) {
    throw "Missing $sourceName. Store it in secrets/dev/neon.yaml and load it through SOPS exec-env."
  }

  if ($RequireDirect -and $value -match "-pooler\.") {
    throw "$sourceName must be a direct Neon connection URL for Alembic migrations, not a pooled -pooler URL."
  }

  $env:KAI_CHATTR_DATABASE_URL = $value
  $env:KAI_CHATTR_DATABASE_MODE = "postgres"
}
