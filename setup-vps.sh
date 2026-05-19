#!/bin/bash
# Run this ONCE on a fresh Hetzner (or any Ubuntu 24.04) VPS as root.
# Usage: bash setup-vps.sh <your-github-username>
set -euo pipefail

GHCR_OWNER="${1:?Usage: bash setup-vps.sh <github-username>}"

# ── 1. System update ──────────────────────────────────────────────────────────
apt-get update && apt-get upgrade -y

# ── 2. Install Docker ─────────────────────────────────────────────────────────
apt-get install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# ── 3. Create deploy user ─────────────────────────────────────────────────────
useradd -m -s /bin/bash deploy || true
usermod -aG docker deploy

# ── 4. Set up project directory ───────────────────────────────────────────────
mkdir -p /opt/gachavault/nginx
chown -R deploy:deploy /opt/gachavault

# ── 5. UFW firewall ───────────────────────────────────────────────────────────
apt-get install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo ""
echo "=== VPS setup complete ==="
echo ""
echo "Next steps:"
echo "  1. As the 'deploy' user, copy your repo files to /opt/gachavault/"
echo "  2. Copy .env.prod.example to /opt/gachavault/.env and fill in real values"
echo "  3. Copy nginx/nginx.conf to /opt/gachavault/nginx/nginx.conf"
echo "  4. Replace YOUR_DOMAIN in nginx.conf with your actual domain"
echo "  5. Run the SSL bootstrap: bash /opt/gachavault/init-ssl.sh yourdomain.com"
echo "  6. Add GitHub Actions secrets (see DEPLOY.md)"
echo ""
