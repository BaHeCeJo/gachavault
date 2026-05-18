# Run this script ONCE after cloning or adding new SQL queries.
# It starts the postgres container, runs all migrations, generates
# the SQLx offline query cache (.sqlx/), then stops the container.
#
# Prerequisites: Docker Desktop must be running.
# Usage: .\scripts\setup-sqlx.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "==> Starting postgres (docker-compose)..." -ForegroundColor Cyan
docker compose up -d postgres

Write-Host "==> Waiting for postgres to be healthy..." -ForegroundColor Cyan
$retries = 30
for ($i = 0; $i -lt $retries; $i++) {
    $health = docker inspect --format="{{.State.Health.Status}}" (docker compose ps -q postgres) 2>$null
    if ($health -eq "healthy") { break }
    if ($i -eq $retries - 1) { Write-Error "Postgres did not become healthy in time"; exit 1 }
    Start-Sleep 2
}
Write-Host "==> Postgres is ready." -ForegroundColor Green

$dbUrl = "postgresql://gachavault:devpassword123@localhost:5432/gachavault"
$env:DATABASE_URL = $dbUrl

# Install sqlx-cli if not present
if (-not (Get-Command "sqlx" -ErrorAction SilentlyContinue)) {
    Write-Host "==> Installing sqlx-cli..." -ForegroundColor Cyan
    cargo install sqlx-cli --no-default-features --features rustls,postgres
}

# Run migrations for each service that has them
$services = @(
    "services/auth-service",
    "services/games-service",
    "services/items-service",
    "services/collections-service",
    "services/tierlists-service",
    "services/media-service"
)

foreach ($svc in $services) {
    $migrationsPath = Join-Path $root "$svc/migrations"
    if (Test-Path $migrationsPath) {
        Write-Host "==> Running migrations for $svc..." -ForegroundColor Cyan
        sqlx migrate run --source "$migrationsPath" --database-url $dbUrl
    }
}

# Generate the offline query cache
Write-Host "==> Generating SQLx offline cache (cargo sqlx prepare)..." -ForegroundColor Cyan
$env:SQLX_OFFLINE = "false"
cargo sqlx prepare --workspace -- --all-targets

Write-Host "==> Done! .sqlx/ cache generated." -ForegroundColor Green
Write-Host "==> You can now build without a database: cargo build" -ForegroundColor Green

# Optionally stop postgres
$stop = Read-Host "Stop postgres container? [y/N]"
if ($stop -eq "y" -or $stop -eq "Y") {
    docker compose stop postgres
    Write-Host "==> Postgres stopped." -ForegroundColor Yellow
}
