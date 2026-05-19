#!/usr/bin/env bash
# Run once on a fresh Ubuntu 22.04/24.04 VPS as root.
set -euo pipefail

echo "=== GachaVault VPS Setup ==="

# 1. System updates
apt-get update && apt-get upgrade -y

# 2. Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 3. Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# 4. Create app user
useradd -m -s /bin/bash gachavault || true
usermod -aG docker gachavault

# 5. Clone repo into /opt/gachavault
mkdir -p /opt/gachavault
# Replace with your actual GitHub repo URL:
git clone https://github.com/BaHeCeJo/gachavault.git /opt/gachavault || true
chown -R gachavault:gachavault /opt/gachavault

# 6. Create .env file (edit this after running)
cat > /opt/gachavault/.env <<'ENVEOF'
POSTGRES_PASSWORD=CHANGE_ME
REDIS_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_64_CHAR_RANDOM_STRING
INTERNAL_SECRET=CHANGE_ME_32_CHAR_RANDOM_STRING
MEILISEARCH_MASTER_KEY=CHANGE_ME

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=noreply@yourdomain.com
SMTP_PASSWORD=CHANGE_ME
FROM_EMAIL=noreply@yourdomain.com

FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://yourdomain.com

GHCR_OWNER=BaHeCeJo
ENVEOF

chmod 600 /opt/gachavault/.env

# 7. Set up nginx ssl directory
mkdir -p /opt/gachavault/nginx/ssl

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit /opt/gachavault/.env with real secrets"
echo "  2. Edit /opt/gachavault/nginx/nginx.conf — replace YOUR_DOMAIN"
echo "  3. Get TLS cert: docker run --rm -v certbot_conf:/etc/letsencrypt -v certbot_www:/var/www/certbot certbot/certbot certonly --webroot --webroot-path=/var/www/certbot -d YOUR_DOMAIN --email YOUR_EMAIL --agree-tos --no-eff-email"
echo "  4. docker compose -f /opt/gachavault/docker-compose.prod.yml up -d"
echo ""
echo "GitHub Actions secrets to add:"
echo "  VPS_HOST     — your VPS IP or hostname"
echo "  VPS_USER     — gachavault (or root)"
echo "  VPS_SSH_KEY  — private key for SSH access"
