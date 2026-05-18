# Start all infrastructure (postgres, redis, meilisearch) for local development.
# Services (Rust) are run individually via `cargo run -p <service>`.
#
# Usage: .\scripts\dev.ps1

Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if (-not (Test-Path ".env")) {
    Write-Warning ".env not found — copying from .env.example"
    Copy-Item ".env.example" ".env"
}

Write-Host "==> Starting infrastructure..." -ForegroundColor Cyan
docker compose up -d postgres redis meilisearch

Write-Host "==> Waiting for postgres..." -ForegroundColor Cyan
$retries = 30
for ($i = 0; $i -lt $retries; $i++) {
    $health = docker inspect --format="{{.State.Health.Status}}" (docker compose ps -q postgres) 2>$null
    if ($health -eq "healthy") { break }
    if ($i -eq $retries - 1) { Write-Error "Postgres did not become healthy"; exit 1 }
    Start-Sleep 2
}

Write-Host ""
Write-Host "==> Infrastructure is up!" -ForegroundColor Green
Write-Host ""
Write-Host "Now run each service in a separate terminal:" -ForegroundColor Yellow
Write-Host "  cargo run -p auth-service"
Write-Host "  cargo run -p games-service"
Write-Host "  cargo run -p items-service"
Write-Host "  cargo run -p collections-service"
Write-Host "  cargo run -p tierlists-service"
Write-Host "  cargo run -p media-service"
Write-Host "  cargo run -p search-service"
Write-Host "  cargo run -p notifications-service"
Write-Host "  cargo run -p api-gateway"
Write-Host "  cd web && npm run dev"
Write-Host ""
Write-Host "Or to start all Rust services at once with cargo-watch:" -ForegroundColor Yellow
Write-Host "  cargo install cargo-watch"
Write-Host "  cargo watch -x 'run -p api-gateway'"
