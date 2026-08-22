# DRISHTI Realtime Architecture

DRISHTI is one Express/tRPC application backed by the configured Drizzle database and storage adapter. `APP_MODE=real` is the default. Demo records and synthetic AI output are available only when `APP_MODE=demo` is explicitly set.

## Connected flow

Admin session and paper setup -> signed intake QR -> scanner capture and storage -> database bundle -> evaluator assignment -> Sarvam extraction -> xAI grading suggestion -> human submission -> final artifact -> identity-matched re-check -> assigned resolution.

The database is the source of truth. Admin, scanner history, evaluator, and re-checker queries refresh every five seconds. This is controlled polling, not a WebSocket transport. Mutations persist before a refreshed view can display the transition.

## Trust boundaries

- HTTP-only role cookie with server-verified JWT and active-user lookup.
- Role and object-level authorization on tRPC procedures.
- Signed/versioned HMAC intake QR with status and optional expiry.
- Private storage access through the existing server storage proxy.
- AI keys remain server-side; real mode has no synthetic fallback.
