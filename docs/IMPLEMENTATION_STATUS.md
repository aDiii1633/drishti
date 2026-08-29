# DRISHTI Implementation Status

Audit date: 2026-08-29 (previous pass 2026-08-28). Scope: the repository at `D:\drishti` and the local ScanGate USB-agent integration.

| Component | Current state | Problems / limits | Required action |
| --- | --- | --- | --- |
| Frontend | Working React + Vite client with role-isolated workspaces, scanner intake, evaluator marking, admin, student and re-check views | Browser visual QA still needs a live browser session; no dedicated frontend E2E suite is committed | Run the UI smoke checklist in `docs/TESTING.md` for releases |
| Backend/API | Working Express server with tRPC and a small public `/api/v1` surface | USB ingestion is intentionally owned by the external ScanGate service, not this repository | Keep the service boundary explicit and configure the ScanGate endpoint |
| Database | Working Drizzle schema over SQLite/libSQL with migrations | Multi-record scanner writes are not wrapped in a transaction | Add a transaction/compensation strategy before high-volume deployment |
| Authentication | Working local email/password, scrypt hashes, signed role sessions, active-account and role checks. Sign-in is rate limited per account and per address | Password reset and external identity federation are not part of this local path; rate-limit counters are per process, not shared across replicas | Add only when an operational requirement exists; move counters to a shared store before running more than one replica |
| Storage | Working local filesystem adapter with normalized keys, content-type sidecars and proxy access | Local disk is not durable or multi-node storage | Use private object storage with backups for production |
| Image intake | Working PDF, multi-image, browser-camera and ScanGate hardware intake paths with clarity checks | No in-repo OpenCV, perspective correction or handwriting OCR implementation | Keep unsupported stages marked partial; integrate the external ScanGate processor where required |
| Evaluation | Working rubric-bound Gemini question-first grading and human mark submission | Semantic grading still depends on configured Gemini access and teacher review | Monitor provider failures and retain human approval as authority |
| QR | Working signed intake QR issuance, verification, expiry and revocation | Final-record public verification is separate from intake QR resolution | Keep both token lifecycles distinct |
| Assignment/re-check | Working database-backed admin assignment, evaluator visibility and student re-check requests | Realtime is five-second polling, not push events | Add push only if measured load requires it |
| USB agent | Working TypeScript serial bridge design with handshake, binary framing, CRC, ACK/NACK, retries and idempotent capture ids | The current machine probe did not list COM17; firmware source is not in this repository | Connect/flash the external firmware, then verify device info and camera readiness |
| Firmware/display/lighting | Not implemented in this repository | No ESP32, Nextion, LED-strip or MOSFET source exists here; GPIO assumptions cannot be verified | Use the ScanGate firmware repository and its wiring contract |
| Deployment | Local development and production build scripts work | No production TLS, durable storage, migrations automation or monitoring configuration is included | Follow `docs/DEPLOYMENT.md` |

## Verified baseline

Measured on 2026-08-29 against this working tree.

- `pnpm check` (`tsc --noEmit`): passed, exit 0.
- `pnpm test`: 100 passed, 2 intentionally skipped, 34 files. The previous pass recorded 91 passed; the 9 added tests cover the rate limiter and malformed password hashes.
- `pnpm build`: passed.
- Server boot in demo mode: started and served on port 3100.

### Live endpoint checks

Run against the booted server, not inferred from the source.

- `GET /api/v1/health`: `200 {"ok":true,"database":"ready"}`.
- `GET /api/v1/ai/status`: `200`, reports provider/model readiness and returns no credentials.
- `GET /api/v1/qr/verify/bad!token`: `400`, malformed tokens rejected before any lookup.
- `bundles.list`, `dashboard.summary`, `admin.console`, `deviations.list`, `student.workspace`, `session.current` called without a session: all `401 UNAUTHORIZED`. Backend authorization is enforced independently of the client.
- `session.login` with wrong credentials: attempts 1-8 `401`, attempt 9 onward `429 TOO_MANY_REQUESTS`. A second login id from the same address still received `401`, confirming the per-account key does not lock out other staff.
- Storage proxy path traversal, sent over a raw socket so the path is not normalised by the client: `/manus-storage/../.env`, `..%2F.env`, `../../.env` and `..\..\.env` all returned `400` with no file content. (An HTTP client that normalises the URI collapses these before they are sent and therefore does not test the route.)

### Not certified in this run

- `SerialPort.list()` probe: no COM17 device was returned, so USB readiness is not certified.
- Gemini grading was not exercised against the live provider; only the configuration-failure path and the schema-validation/retry logic are covered by tests.
- No browser-driven UI test was run. Frontend state remains verified by build and the manual checklist in `docs/TESTING.md`.
