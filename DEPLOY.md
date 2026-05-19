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
1. Builds all Docker images on GitHub's servers (free, ~15 minutes)
2. Pushes images to GitHub Container Registry
3. SSHes into your VPS and does `docker compose pull && up -d`

You never compile Rust on your laptop again.

---

## Costs summary

| Item | Cost |
|---|---|
| Hetzner CX32 | ~€8.29/month |
| Domain (.com) | ~$10/year |
| GitHub Actions | Free (2000 min/month on free tier) |
| GHCR storage | Free for public repos; ~$0.50/GB for private |
| Brevo email | Free (300 emails/day) |
| Let's Encrypt SSL | Free |
| **Total** | **~€9/month** |
