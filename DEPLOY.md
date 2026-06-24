# Deployment Guide

Everything needed to go from zero to a live public site.

---

## 1. Get a server and domain

### Server — Hetzner CX32
1. Sign up at **hetzner.com/cloud**
2. Create a project → **Add Server**
   - Location: pick nearest to your users (e.g. Helsinki)
   - Image: **Ubuntu 24.04**
   - Type: **CX32** (4 vCPU, 8 GB RAM) — €8.29/month
   - SSH keys: paste your public key (`~/.ssh/id_rsa.pub` or generate one)
   - Name: `gachavault-prod`
3. Note the server's IPv4 address.

### Domain
- Register at **Cloudflare Registrar** (cloudflare.com/products/registrar) or Namecheap (~$10/year for `.com`)
- In your DNS settings, add an **A record**: `@` → your server's IP
- DNS propagation takes 5–30 minutes

---

## 2. Set up the server (run once)

SSH in as root:
```bash
ssh root@YOUR_SERVER_IP
```

Run the setup script (substitute your GitHub username):
```bash
curl -fsSL https://raw.githubusercontent.com/BaHeCeJo/gachavault/main/setup-vps.sh | bash -s BaHeCeJo
```

Or copy the file manually and run `bash setup-vps.sh BaHeCeJo`.

---

## 3. Put config files on the server

From your local machine:
```bash
# Copy nginx config
scp nginx/nginx.conf root@YOUR_SERVER_IP:/opt/gachavault/nginx/nginx.conf

# Copy the env template, then fill it in on the server
scp .env.prod.example root@YOUR_SERVER_IP:/opt/gachavault/.env
```

Then SSH in and edit the `.env`:
```bash
ssh root@YOUR_SERVER_IP
nano /opt/gachavault/.env
```

Fill in every value (see `.env.prod.example` for the full list). The most important ones:
- `POSTGRES_PASSWORD` — generate with: `openssl rand -hex 32`
- `REDIS_PASSWORD` — generate with: `openssl rand -hex 32`
- `JWT_SECRET` — generate with: `openssl rand -hex 32`
- `INTERNAL_SECRET` — generate with: `openssl rand -hex 32`
- `MEILISEARCH_MASTER_KEY` — generate with: `openssl rand -hex 32`
- `FRONTEND_URL` / `BACKEND_URL` — set to `https://yourdomain.com`
- SMTP — use **Brevo** (free plan: 300 emails/day): sign up at brevo.com → SMTP & API → SMTP settings

### Optional: Pre-populate Docker secret files

The Rust services now read passwords from `*_FILE` env vars first (Docker
secrets pattern) and fall back to plain env vars. A follow-up commit will
flip `docker-compose.prod.yml` to use the file paths exclusively — when
that lands, you'll need these files in place. Run this on the VPS now to
get ahead of it:

```bash
sudo bash /opt/gachavault/scripts/migrate-env-to-secrets.sh /opt/gachavault/.env
```

The script reads every secret out of your `.env` and writes one file per
secret to `/opt/gachavault/secrets/` with mode `600`. Idempotent — safe
to run multiple times. After the compose flip ships, you can strip the
secret values from `.env` and rotate them by editing the files directly.

---

## 4. Get the SSL certificate (run once, after DNS propagates)

```bash
ssh root@YOUR_SERVER_IP
bash /opt/gachavault/init-ssl.sh yourdomain.com your@email.com
```

This issues a Let's Encrypt certificate and patches `nginx.conf` with your domain.

---

## 5. Set up GitHub repository and Actions

### Push your code to GitHub
```bash
# In C:\Users\octob\Bureau\codes\websites\gachawiki
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/BaHeCeJo/gachavault.git
git push -u origin main
```

### Add GitHub Actions secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret name | Value |
|---|---|
| `VPS_HOST` | Your server's IPv4 address |
| `VPS_USER` | `root` (or `deploy` if you created that user) |
| `VPS_SSH_KEY` | Contents of your private SSH key (`~/.ssh/id_rsa`) |

### Add a GitHub Actions environment

Go to **Settings** → **Environments** → **New environment** → name it `production`.

---

## 6. Copy the compose file to the server and start

The deploy workflow pulls `docker-compose.prod.yml` from `git pull` on the server. For the very first deploy, do it manually:

```bash
ssh root@YOUR_SERVER_IP
cd /opt/gachavault

# The repo needs to be cloned here so `git pull` works in CI
git clone https://github.com/BaHeCeJo/gachavault.git .

# Log in to GHCR (first time only)
docker login ghcr.io -u BaHeCeJo

# Start everything
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## 7. Create the first superadmin

After registering an account on the live site:

```bash
ssh root@YOUR_SERVER_IP
cd /opt/gachavault
docker exec -i $(docker ps -qf name=postgres) psql -U gachavault -d gachavault -c "
  INSERT INTO auth.user_roles (user_id, role, game_id, section_id)
  SELECT id, 'superadmin', NULL, NULL
  FROM auth.users WHERE email = 'your@email.com'
  ON CONFLICT DO NOTHING;
"
```

---

## 8. Subsequent deploys

After step 5 is set up, every `git push` to `main` automatically:
1. Detects which services actually changed and builds **only those** on
   GitHub's servers; unchanged services are retagged to the new commit SHA
   without rebuilding (see `.github/scripts/detect-changed-services.sh`). A
   one-service change is a couple of minutes; a shared-crate / `Cargo.lock` /
   `.sqlx` change rebuilds everything (~15 min).
2. Pushes images to GitHub Container Registry
3. SSHes into your VPS and does `docker compose pull && up -d`

You never compile Rust on your laptop again.

> **Actions minutes:** unlimited and free while the repo is **public**. If you
> switch it to **private**, GitHub Free meters builds at **2,000 min/month**
> (Pro: 3,000), then ~$0.006/min on Linux — which is why the pipeline only
> rebuilds changed services.

---

## Costs summary

| Item | Cost |
|---|---|
| Hetzner CX32 | ~€8.29/month |
| Domain (.com) | ~$10/year |
| GitHub Actions | Free & unlimited on public repos; 2,000 min/month on private (Free tier) |
| GHCR storage | Free — ghcr.io container storage & bandwidth are currently free regardless of repo visibility |
| Brevo email | Free (300 emails/day) |
| Let's Encrypt SSL | Free |
| **Total** | **~€9/month** |

---

## 9. Wire up alert notifications (one-time)

Grafana ships alert rules that fire on Postgres FATAL/PANIC, service
panics, nginx 5xx spikes, certbot renewal failures, and missing
off-site backups. They run from day one — but until you connect a
contact point they only show up in the Grafana UI (SSH-tunnel to view).

To get pushed alerts:

```bash
ssh root@YOUR_SERVER_IP
cd /opt/gachavault
# Replace the placeholder webhook with your real Discord/Slack URL:
nano observability/grafana-provisioning/alerting/contact_points.yml
docker compose -f docker-compose.prod.yml restart grafana
```

To view, silence, or tune rules without editing files, SSH-tunnel in:

```bash
ssh -L 3010:grafana:3000 deploy@YOUR_SERVER_IP
# browse http://localhost:3010/alerting/list
# admin password is in /opt/gachavault/secrets/grafana_admin_password
```

Edits made in the UI persist in Grafana's database but are overridden
by the provisioned files on next restart — treat the YAML as source
of truth.

---

## 10. Incident response runbook

A solo-operator pocket card. Each scenario assumes you've SSH'd into
the VPS as root and `cd /opt/gachavault`.

### Site is down — first 60 seconds

```bash
# 1. See what's running
docker compose -f docker-compose.prod.yml ps

# 2. Look for crash loops (anything in 'Restarting' state)
docker compose -f docker-compose.prod.yml logs --tail=50 --since=10m \
  $(docker compose -f docker-compose.prod.yml ps --services)

# 3. If nginx is the only thing down, restart it
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

### One service is stuck

```bash
# Restart in-place (keeps state)
docker compose -f docker-compose.prod.yml restart <service-name>

# Or full recreate (re-reads compose changes)
docker compose -f docker-compose.prod.yml up -d --force-recreate <service-name>
```

### Postgres is wedged

```bash
# See active connections + locks
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U gachavault -d gachavault -c \
  "SELECT pid, state, wait_event_type, wait_event, query
   FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"

# Cancel a runaway query
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U gachavault -d gachavault -c "SELECT pg_cancel_backend(<pid>);"

# Last resort — recycle Postgres (drops all connections)
docker compose -f docker-compose.prod.yml restart postgres
```

### Restore the database from backup

```bash
# 1. Find the most recent backup
docker compose -f docker-compose.prod.yml exec db-backup \
  ls -lh /backups | tail -5

# 2. Stop services that write to the DB
docker compose -f docker-compose.prod.yml stop \
  auth-service games-service items-service collections-service \
  tierlists-service media-service notifications-service events-service

# 3. Restore (replace TIMESTAMP)
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U gachavault -d gachavault \
  < <(docker compose -f docker-compose.prod.yml exec db-backup \
        cat /backups/gachavault_TIMESTAMP.sql.gz | gunzip)

# 4. Bring services back up
docker compose -f docker-compose.prod.yml up -d
```

### Rollback a bad deploy

```bash
# On your laptop
git revert HEAD --no-edit
git push origin main
# CI rebuilds the previous code under a new SHA and redeploys.
```

If you can't wait for CI (~10 min), redeploy the previous image
directly on the VPS:

```bash
# Find the previous SHA in GHCR (look at the git log)
git log --oneline -5
# Then on the VPS, override IMAGE_TAG and recreate:
IMAGE_TAG=<previous-sha> GHCR_OWNER=$(echo $GHCR_ACTOR | tr A-Z a-z) \
  docker compose -f docker-compose.prod.yml up -d --force-recreate
```

### TLS cert expired or about to

```bash
# Check current cert
docker compose -f docker-compose.prod.yml exec certbot \
  openssl x509 -enddate -noout \
    -in /etc/letsencrypt/live/hotarumi.com/fullchain.pem

# Force a renewal attempt now (don't wait for the 12h loop)
docker compose -f docker-compose.prod.yml exec certbot \
  certbot renew --force-renewal

# After renewal, reload nginx
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Lost the Grafana admin password

It's regenerated by `migrate-env-to-secrets.sh` on first run and stored
at `/opt/gachavault/secrets/grafana_admin_password` — just `cat` it.

### Can't SSH

Use the Hetzner web console (Cloud Console → server → Console tab).
Login as root with the password you set during initial setup, or
recover via Hetzner's Rescue System if the password was lost. Inside
the console you can run the same `docker compose` commands.
