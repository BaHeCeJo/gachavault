#!/bin/bash
# Bootstrap Let's Encrypt SSL certificate for a fresh domain.
# Run ONCE after pointing your domain's A record to this server's IP.
# Usage: bash init-ssl.sh yourdomain.com your@email.com
set -euo pipefail

DOMAIN="${1:?Usage: bash init-ssl.sh <domain> <email>}"
EMAIL="${2:?Usage: bash init-ssl.sh <domain> <email>}"
COMPOSE_FILE="/opt/gachavault/docker-compose.prod.yml"

cd /opt/gachavault

# Step 1: Start nginx with a temporary HTTP-only config so certbot can do its challenge
cat > /tmp/nginx-init.conf << EOF
events { worker_connections 1024; }
http {
    server {
        listen 80;
        server_name ${DOMAIN};
        location /.well-known/acme-challenge/ { root /var/www/certbot; }
        location / { return 200 "initializing..."; add_header Content-Type text/plain; }
    }
}
EOF

docker run -d --name nginx-init \
  -p 80:80 \
  -v /tmp/nginx-init.conf:/etc/nginx/nginx.conf:ro \
  -v certbot_www:/var/www/certbot \
  nginx:alpine

# Step 2: Get the certificate
docker run --rm \
  -v certbot_conf:/etc/letsencrypt \
  -v certbot_www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot --webroot-path=/var/www/certbot \
    --email "${EMAIL}" \
    --agree-tos --no-eff-email \
    -d "${DOMAIN}"

# Step 3: Remove temp nginx
docker stop nginx-init && docker rm nginx-init

# Step 4: Update nginx.conf with the real domain
sed -i "s/YOUR_DOMAIN/${DOMAIN}/g" /opt/gachavault/nginx/nginx.conf

echo ""
echo "=== SSL certificate issued for ${DOMAIN} ==="
echo ""
echo "Now start the full stack:"
echo "  cd /opt/gachavault && docker compose -f docker-compose.prod.yml up -d"
echo ""
