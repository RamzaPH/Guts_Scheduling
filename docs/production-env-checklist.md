# Production Environment Checklist

Use this checklist before running on a new server machine.

## 1) Prepare .env

1. Copy `.env.production.template` to `.env` in repository root.
2. Replace all `REPLACE_*` values.
3. Set `CORS_ALLOWED_ORIGINS` to the exact browser origins that will call the API.
4. If the public QR form is exposed on `https://guts-driving.site`, add that domain and the private admin origin if it stays separate.

Example:

- `CORS_ALLOWED_ORIGINS=https://guts-driving.site,https://guts-admin.tailnet.ts.net`

## 2) First Boot Toggles (fresh database)

Set:

- `DB_BOOTSTRAP_SYNC=true`
- `SEED_DEFAULT_USERS=true`

Purpose:

- bootstrap missing base schema only on first deployment
- create initial admin/staff accounts

## 3) After First Successful Login

Set:

- `DB_BOOTSTRAP_SYNC=false`
- `SEED_DEFAULT_USERS=false`

Then redeploy to lock into migration-first startup.

## 4) Required Secret Rotation

- `JWT_SECRET`
- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `SEED_ADMIN_PASSWORD`
- `SEED_STAFF_PASSWORD`
- `SMTP_PASSWORD` (if SMTP is enabled)

## 5) Access Model

- Use Tailscale only.
- Do not publish MySQL port publicly.
- Do not configure router port-forwarding to the app.

If you need the public QR form, follow [docs/public-qr-cloudflared-rollout.md](docs/public-qr-cloudflared-rollout.md) so only the QR enrollment paths are exposed through Cloudflare Tunnel.

## 6) One-Command Deploy

Windows:

```powershell
.\scripts\deploy-prod.ps1
```

Linux/macOS:

```bash
./scripts/deploy-prod.sh
```

## 7) Verification

Windows:

```powershell
.\scripts\verify-prod.ps1
```

Linux/macOS:

```bash
./scripts/verify-prod.sh
```