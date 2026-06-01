# GTS Frontend (React + Vite)

Frontend for the Guardians Technical School management system.

## Tech Stack

- React 19
- React Router 7
- TanStack Query 5
- Tailwind CSS 4
- Vite 7

## Local Development

Recommended: run root bootstrap first from repository root:

- Windows PowerShell: `./scripts/bootstrap.ps1`
- macOS/Linux: `./scripts/bootstrap.sh`

This auto-creates `frontend/.env` from `frontend/.env.example`.

1. Install dependencies:
	- `npm install`
2. Run development server:
	- `npm run dev`
3. Build for production:
	- `npm run build`
4. Preview production build:
	- `npm run preview`

## Env Variables

- `VITE_API_BASE_URL` (default `/api`)
- `VITE_API_PROXY_TARGET` (local default `http://localhost:5000`, Docker `http://backend:5000`)
- `VITE_HMR_CLIENT_PORT` (optional; used in Docker port mapping scenarios)
- `VITE_PUBLIC_QR_BASE_URL` (public enrollment domain used when generating QR links, for example `https://guts-driving.site`)

## Frontend Highlights

- Role-aware dashboard and management views (admin, sub-admin, staff).
- Enrollment workflow with schedule reservation flow.
- Students page with live summary cards, filters, and responsive table handling.
- Notification bell integration for admin, sub-admin, and staff roles.

## Recent UI/UX Updates (April 2026)

- Dashboard summary queries now self-heal better on transient failures with improved retry behavior.
- Pending approvals now combine schedule-change requests and pending enrollments.
- Pending approvals card now supports internal scrolling and fixed-height behavior for cleaner alignment.
- Students and enrollment pages received responsive layout adjustments to behave better at browser zoom levels.
- Global motion polish added:
  - smoother scrolling
  - subtle component transitions
  - route fade-in animations with reduced-motion support

## Notifications Behavior

- Notification feed is now visible and active for staff as well as admin/sub-admin.
- Notifications are currently a shared stream (not recipient-scoped).

## Linting

- Run:
  - `npm run lint`
- Note: current workspace may include existing lint issues unrelated to your latest changes.
