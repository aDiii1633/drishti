# DRISHTI Deployment

## Local

```powershell
pnpm install
Copy-Item .env.example .env
pnpm db:push
pnpm dev
```

Open `http://localhost:3000` unless the preferred port is busy; the server logs the active port.

## Production prerequisites

- Node.js 20+ and pnpm.
- `APP_MODE=real`, unique `JWT_SECRET` and `QR_SIGNING_SECRET` of at least 32 characters.
- Durable database and private object storage configuration.
- Server-only `GEMINI_API_KEY` if AI grading is required.
- ScanGate reviewer configuration and the loopback USB agent token if hardware is required.
- TLS termination, secure cookies, backups, monitoring, rate limiting and log retention.

Never expose `.env`, Gemini keys, reviewer tokens, device keys or USB-agent tokens to the browser or commit them to Git. The standalone USB agent now refuses a missing/default ingestion token outside demo mode.

## Hosted deployment: split architecture

DRISHTI builds two artifacts: a static SPA (`dist/public`) and a long-running Node server (`dist/index.js`). They deploy to different places.

```
Browser
   |
   v
Vercel  (static SPA + same-origin rewrites)
   |  /api/*  and  /manus-storage/*  proxied
   v
API host  (Railway / Render / Fly.io - runs dist/index.js)
   |
   +--> Turso        (libsql://  DATABASE_URL)
   +--> S3 bucket    (object storage)
```

### Why the server is not on Vercel

Three verified blockers, not preferences:

1. `server/_core/index.ts` calls `http.createServer(app).listen()`. Vercel runs serverless functions, not persistent processes.
2. `DATABASE_URL` defaults to `file:local-data/drishti.db`. Vercel's filesystem is ephemeral and read-only outside `/tmp`, so writes are lost.
3. `server/storage.ts` writes uploads under `local-storage/` on local disk, with the same persistence problem.

### Why rewrites, not a cross-origin API URL

The role session cookie is set with `sameSite: "lax"` (`server/_core/cookies.ts`). If the SPA were served from `*.vercel.app` while the API answered on a different origin, the browser would withhold that cookie on API calls and **every authenticated request would fail**.

Routing `/api/*` and `/manus-storage/*` through Vercel rewrites keeps the browser on a single origin, so cookies continue to work with **no change to the authentication code**. Take this path unless you are prepared to move the session to `SameSite=None; Secure` and add a CORS allowlist.

### Steps

1. **Provision the database.** Create a Turso database. The driver is already `@libsql/client`, so this is configuration only — set `DATABASE_URL` to the `libsql://...` URL and supply the auth token. Run `pnpm db:push` against it.
2. **Provision storage.** Create a private S3-compatible bucket. `server/storage.ts` currently has a filesystem adapter; an object-storage adapter must be written against its existing interface (`storagePut`, `storageGet`, `storageGetBuffer`, `storageDelete`). **This code does not exist yet** — the local adapter will not persist on a container host that restarts.
3. **Deploy the API server.** Push `dist/index.js` to Railway, Render or Fly.io with `pnpm build && pnpm start`. Set every server-side variable listed in the README. Set `PUBLIC_APP_URL` to the public Vercel URL.
4. **Deploy the SPA.** Import the repository into Vercel. `vercel.json` already sets the build command and output directory.
5. **Replace the rewrite placeholder.** In `vercel.json`, change both `REPLACE-WITH-YOUR-API-HOST` occurrences to the API host from step 3, then redeploy. **Until this is done the SPA loads but every API call 404s.**
6. **Verify** sign-in, an upload, and a marking session against the deployed pair before announcing the environment.

### Known deployment risks

- `serialport` sits in runtime `dependencies` although only the standalone CLI in `tools/scangate-usb-agent` imports it. It pulls a native binding on every install, including Vercel's. If a Vercel build fails on `@serialport/bindings-cpp`, move `serialport` to `devDependencies` — nothing on the server path imports it.
- In-memory state (the sign-in rate limiter, hardware capture sessions) is per process. It is correct for a single API instance; running more than one requires a shared store.
- `pnpm-workspace.yaml` lists win32-specific packages under `onlyBuiltDependencies`. These are allow-list entries rather than requirements and should be inert on Linux, but check the first build log.
