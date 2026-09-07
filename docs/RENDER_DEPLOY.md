# DRISHTI API — Render deployment

The Vercel project serves the SPA and proxies `/api/*` and `/manus-storage/*`
to this Render service (`vercel.json` rewrites), so the browser stays on one
origin and the `sameSite=lax` role-session cookie keeps working.

A Render Blueprint (`render.yaml`) is **not** committed because the Vercel CLI
mis-parses a root `render.yaml` as a Vercel `services` manifest. Set the
service up manually instead — same values.

## Create the service

Render dashboard → **New → Web Service** → connect `aDiii1633/drishti`.

| Field | Value |
|---|---|
| Name | `drishti-api` (yields `https://drishti-api.onrender.com`, which `vercel.json` already targets) |
| Region | any (Singapore is closest to India) |
| Branch | `main` |
| Runtime | Node |
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm build` |
| Pre-deploy command | `DATABASE_URL=$DEMO_DATABASE_URL pnpm exec drizzle-kit migrate` |
| Start command | `pnpm start` |
| Health check path | `/` |
| Instance type | **Starter** or higher — required for a persistent disk |

## Persistent disk

Add a disk (Settings → Disks):

| Field | Value |
|---|---|
| Name | `drishti-data` |
| Mount path | `/var/data` |
| Size | 1 GB |

Holds the SQLite database and uploaded answer-sheet files, so both survive
restarts and redeploys.

## Environment variables

Plain values:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_MODE` | `demo` |
| `DEMO_ACCESS_MODE` | `true` |
| `DATABASE_URL` | `file:/var/data/drishti.db` |
| `DEMO_DATABASE_URL` | `file:/var/data/drishti-demo.db` |
| `STORAGE_ROOT` | `/var/data/local-storage` |
| `PUBLIC_APP_URL` | the production Vercel URL (e.g. `https://drishti-cloud.vercel.app`) |

Secrets (set in the Render dashboard, never in Git):

| Key | Notes |
|---|---|
| `DRISHTI_DEMO_PASSWORD` | the demo account password |
| `JWT_SECRET` | 48+ random bytes, base64url |
| `QR_SIGNING_SECRET` | 48+ random bytes, base64url |
| `SUPRSONIC_API_KEY` | Suprsonic AI key — optional; without it AI grading shows a visible config error and manual evaluation still works |

## After it is live

1. Confirm the service URL. If it is not `https://drishti-api.onrender.com`,
   update both rewrite destinations in `vercel.json` and redeploy Vercel.
2. `GET https://<render-url>/api/trpc/session.access?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D`
   should return JSON with `"demoAccess":true`.
3. Open the Vercel URL and click through a role → workspace.
