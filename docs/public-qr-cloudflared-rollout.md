# Public QR Tunnel Rollout

Use this guide when you want `https://guts-driving.site` to serve only the public QR enrollment flow while keeping the admin dashboard private on Tailscale.

## Recommended topology

1. Keep the app containers on the server as-is.
2. Run `cloudflared` on the same server.
3. Route only the public QR paths through the tunnel.
4. Keep admin access on the private Tailscale URL.

This assumes `guts-driving.site` is registered at Namecheap, but DNS is managed in Cloudflare so the tunnel can create the hostname.

## 1) Move DNS control to Cloudflare

At Namecheap:

1. Open the domain settings for `guts-driving.site`.
2. Change the nameservers to the Cloudflare-assigned nameservers.
3. Keep Namecheap as the registrar.

Without this step, `cloudflared tunnel route dns` cannot create the hostname record.

## 2) Install and authenticate cloudflared

Windows PowerShell:

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel login
```

Linux/macOS:

```bash
cloudflared tunnel login
```

## 3) Create the tunnel

```bash
cloudflared tunnel create guts-driving-qr
```

This creates a tunnel credential file and a tunnel UUID.

## 4) Create the DNS route

```bash
cloudflared tunnel route dns guts-driving-qr guts-driving.site
```

This publishes the public hostname in Cloudflare DNS and points it at the tunnel.

## 5) Cloudflared config

The repo now includes a ready-to-run config at [infra/cloudflared/config.yml](infra/cloudflared/config.yml) and a matching sidecar override at [docker-compose.cloudflare.yml](docker-compose.cloudflare.yml).

If you prefer a local cloudflared install, you can still use `~/.cloudflared/config.yml` on Linux/macOS or `%UserProfile%\.cloudflared\config.yml` on Windows.

```yaml
tunnel: guts-driving-qr
credentials-file: /path/to/guts-driving-qr.json

ingress:
  - hostname: guts-driving.site
    path: /enroll*
    service: http://localhost:8080
  - hostname: guts-driving.site
    path: /assets/*
    service: http://localhost:8080
  - hostname: guts-driving.site
    path: /api/enroll*
    service: http://localhost:8080
  - hostname: guts-driving.site
    path: /favicon.ico
    service: http://localhost:8080
  - hostname: guts-driving.site
    path: /manifest.json
    service: http://localhost:8080
  - service: http_status:404
```

Why this works:

1. `/enroll*` serves the public form route.
2. `/assets/*` serves the built frontend bundles needed by the form.
3. `/api/enroll*` allows template load and submission endpoints.
4. Everything else returns `404`.

## 6) Start the tunnel

Docker sidecar:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.cloudflare.yml up -d --build
```

The sidecar reads [infra/cloudflared/config.yml](infra/cloudflared/config.yml) and mounts `infra/cloudflared` into `/etc/cloudflared`.

```bash
cloudflared tunnel run guts-driving-qr
```

If you want it to run as a service:

Windows:

```powershell
cloudflared service install
```

Linux systemd is typically created through the cloudflared install package or your own service unit.

## 7) Docker-friendly option

If you prefer to run `cloudflared` in Docker, use a small sidecar container and keep the service pointing at the local frontend port:

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --config /etc/cloudflared/config.yml run guts-driving-qr
    volumes:
      - ./infra/cloudflared:/etc/cloudflared:ro
    network_mode: host
```

The host network mode keeps the tunnel able to reach `http://localhost:8080`.

## 8) Security checklist

1. Do not expose MySQL publicly.
2. Do not expose backend ports publicly.
3. Keep the public tunnel restricted to the QR paths only.
4. Keep admin dashboard access on Tailscale.
5. Verify `CORS_ALLOWED_ORIGINS` includes `https://guts-driving.site` and the private admin origin.
6. Verify `VITE_PUBLIC_QR_BASE_URL=https://guts-driving.site` is baked into the frontend build.

## 9) Smoke test

1. Open `https://guts-driving.site/enroll?token=...`.
2. Confirm the public form loads.
3. Submit a test enrollment.
4. Confirm the record appears in Pending QR enrollments.
5. Try a non-QR path like `/admin/qrcodes` from the public domain and confirm it returns `404` or is unreachable.
