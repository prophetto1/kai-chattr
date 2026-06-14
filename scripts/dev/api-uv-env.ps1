# Sets UV_PROJECT_ENVIRONMENT for services/api. No repo-local .venv.
$env:UV_PROJECT_ENVIRONMENT = Join-Path $env:LOCALAPPDATA "uv\envs\kai-chattr-services-api"
