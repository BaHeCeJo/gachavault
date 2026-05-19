# Build all services sequentially to avoid saturating RAM
# Usage: .\build.ps1

$services = @(
    "postgres",
    "redis",
    "meilisearch",
    "notifications-service",
    "auth-service",
    "games-service",
    "items-service",
    "collections-service",
    "tierlists-service",
    "media-service",
    "search-service",
    "api-gateway",
    "web"
)

foreach ($service in $services) {
    Write-Host "`n>>> Building $service..." -ForegroundColor Cyan
    docker compose build $service
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: $service failed to build." -ForegroundColor Red
        exit 1
    }
    Write-Host ">>> $service done." -ForegroundColor Green
}

Write-Host "`nAll services built. Run: docker compose up -d" -ForegroundColor Yellow
