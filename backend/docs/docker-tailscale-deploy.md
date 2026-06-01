# Docker + Tailscale Deployment Guide

## Goal

Run the app for internal company use only:

1. App is hosted on one server.
2. Access is only via Tailscale.
3. No public internet exposure.

If you also need a public QR enrollment entrypoint, use a separate public hostname for the form only and keep the admin dashboard private.

See [docs/public-qr-cloudflared-rollout.md](../docs/public-qr-cloudflared-rollout.md) for the exact Cloudflare Tunnel commands and ingress rules.

## 1) Server Prerequisites

Install on the server:

1. Docker Engine
2. Docker Compose plugin
3. Tailscale client

## 2) Join Server to Tailscale

1. Install Tailscale and login with company account.
2. Verify server appears in your tailnet.
3. Optional: enable MagicDNS so users can use hostname instead of IP.

## 3) Configure Environment

From repository root:

1. Copy `.env.docker.example` to `.env`.
2. Set secure values:
   - `JWT_SECRET`
   - `DB_PASSWORD`
   - `MYSQL_ROOT_PASSWORD`
3. Set `CORS_ALLOWED_ORIGINS` to the exact URL users will open.

Example:

- `CORS_ALLOWED_ORIGINS=https://guts-driving.site,https://guts-admin.tailnet-name.ts.net`

For the public QR flow, also set `VITE_PUBLIC_QR_BASE_URL=https://guts-driving.site` in the frontend build environment so generated QR links always point to the public domain.

## 4) Start Containers

From repository root:

```bash
./scripts/deploy-prod.sh
```

Windows PowerShell:

```powershell
.\scripts\deploy-prod.ps1
```

Manual equivalent command:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

If backend is unhealthy on first run, ensure in root `.env`:

1. `DB_BOOTSTRAP_SYNC=true`
2. `SEED_DEFAULT_USERS=true` (only for initial provisioning)

Then redeploy:

```bash
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --build
```

After first successful startup and login provisioning:

1. Set `DB_BOOTSTRAP_SYNC=false`
2. Set `SEED_DEFAULT_USERS=false`
3. Redeploy:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Services:

1. `db` (MySQL)
2. `backend` (Node API, runs migrations before app startup)
3. `frontend` (Nginx serving built frontend and proxying `/api` to backend)

## 5) Health Checks

From server shell:

```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/ready
```

From PowerShell on Windows:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health
Invoke-WebRequest -UseBasicParsing http://localhost:8080/api/health/ready
```

To open URLs in browser on Windows:

```powershell
Start-Process "http://localhost:8080/api/health"
Start-Process "http://localhost:8080/api/health/ready"
```

Both should return success payloads.

Automated post-deploy verification:

Windows:

```powershell
.\scripts\verify-prod.ps1
```

Linux/macOS:

```bash
./scripts/verify-prod.sh
```

Optional (includes manual backup trigger endpoint test):

Windows:

```powershell
.\scripts\verify-prod.ps1 -RunManualBackup
```

Linux/macOS:

```bash
./scripts/verify-prod.sh --run-manual-backup
```

## 6) Access from Client Devices

1. Install Tailscale on user device.
2. Login with company account.
3. Open app using server Tailscale address:
   - `http://<tailscale-ip>:8080`
   - or MagicDNS hostname

## 7) Lock Down Public Access

1. Do not configure router port forwarding.
2. Keep DB port unpublished (already handled by compose).
3. Restrict access in Tailscale ACLs to approved groups only.

## 8) Backup Operations

Run inside backend container:

```bash
docker exec guts-backend npm run backup:db
docker exec guts-backend npm run backup:monitor
docker exec guts-backend npm run backup:restore-test
```

Backups are stored in `backend/backups` on host via bind mount.

## 9) Update Procedure

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The backend container runs migrations at startup (`npm run migrate && npm start`).

## 10) Dev vs Production Compose

- `docker-compose.yml` is development-oriented (bind mounts and hot reload).
- `docker-compose.prod.yml` is the server profile for production/stable deployment.
