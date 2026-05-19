# Creates the first superadmin user directly in the database.
# Run AFTER `docker compose up -d` and after registering your account normally.
#
# Usage: .\seed-admin.ps1 -Email "your@email.com"

param(
    [Parameter(Mandatory=$true)]
    [string]$Email
)

$sql = @"
INSERT INTO auth.user_roles (user_id, role, game_id, section_id)
SELECT id, 'superadmin', NULL, NULL
FROM auth.users
WHERE email = '$Email'
ON CONFLICT DO NOTHING;

SELECT u.email, COALESCE(r.role, 'user') as role
FROM auth.users u
LEFT JOIN auth.user_roles r ON r.user_id = u.id AND r.game_id IS NULL AND r.section_id IS NULL
WHERE u.email = '$Email';
"@

Write-Host "Setting superadmin role for: $Email" -ForegroundColor Cyan

docker exec -i gachawiki-postgres-1 psql -U gachavault -d gachavault -c $sql

Write-Host ""
Write-Host "Done. Log out and back in for the new role to take effect." -ForegroundColor Green
