# DRISHTI API Surface

## Public HTTP endpoints

- `GET /api/v1/health`: process and database availability.
- `GET /api/v1/ai/status`: provider/model readiness without returning credentials.
- `GET /api/v1/qr/verify/:token`: final-record QR verification.

## Typed application API

The authenticated workflow is exposed through `/api/trpc` and defined in `server/routers.ts`. Important namespaces include `session`, `exam`, `hardware`, `bundles`, `marking`, `admin`, `evaluator`, `student`, `recheckRequests`, `deviations`, `annotations`, `calibration` and `audit`.

All role-sensitive procedures use server-side role and object checks. Scanner capture validates QR-linked paper context before writing a bundle. File payloads are validated for type, size and image/PDF signatures.

Backend authorization does not depend on the client. Calling a protected procedure without a role session returns `UNAUTHORIZED`; bundle-scoped reads and writes additionally resolve ownership through `requireBundleAccess`/`visibleBundleIds`, which scope an operator to captures it created, an evaluator to assigned bundles, a school admin to its own school and a student to its own record. A session that carries no user id is rejected rather than treated as unrestricted.

## Rate limits

Unauthenticated procedures are throttled in-process (`server/rateLimit.ts`). Exceeding a limit returns tRPC code `TOO_MANY_REQUESTS` (HTTP 429) with the retry delay in the message.

| Procedure | Key | Limit |
| --- | --- | --- |
| `session.login` | normalised login id | 8 per 15 minutes, cleared on a successful sign-in |
| `session.login` | client address | 40 per 15 minutes |
| `recheckRequests.create` | client address (unauthenticated callers only) | 10 per hour |

Counters are per process and are not shared across replicas. If DRISHTI is ever scaled horizontally these limits must move to a shared store, or each replica will independently allow the full quota. `requestAddress` only reflects `X-Forwarded-For` when Express `trust proxy` is enabled, which it is not by default; the account key is therefore the primary guard and stays correct behind a proxy or NAT.

## USB ingestion boundary

`POST /api/v1/captures/usb` is the configured external ScanGate service endpoint consumed by `tools/scangate-usb-agent`; it is not currently registered by `server/apiV1.ts`. The agent sends `capture_id`, `page_number`, `booklet_ref`, `frame_0` and `frame_1` to that service so the existing ScanGate processor can produce original/enhanced results. Do not document it as a DRISHTI endpoint unless the external service is intentionally moved into this repository.
