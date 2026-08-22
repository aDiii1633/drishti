# DRISHTI System Map

## Runtime boundary

DRISHTI is a Vite/React client served by Express. The client calls the server through the typed tRPC router in `server/routers.ts`. SQLite/libSQL is accessed through Drizzle in `server/db.ts`; answer-booklet artifacts are stored through `server/storage.ts`.

`APP_MODE=real` is the default runtime mode. Demo seeding only runs when `APP_MODE=demo` is explicitly configured.

## Operational components

| Component | Canonical server capability | Primary records |
| --- | --- | --- |
| Authentication and role desk | `session.login`, `roleAuth.ts`, signed role cookie | `users` |
| Exam control | `exam.*` | `examSessions`, `examPapers`, `markingSchemes` |
| QR intake | `qrToken.ts`, `exam.resolveQr` | signed token plus `examPapers` |
| Scanner desk | `bundles.captureImage`, `appendCapture`, `submitCapture` | `bundles`, `documents`, `pageChecks` |
| Assignment and evaluator | `admin.assignEvaluator`, `evaluator.*`, `evaluations.*` | `bundleAssignments`, `evaluations` |
| AI pipeline | `aiGrading.ts`, `gradeEngine.ts` | `generations`, `evaluations`, `answerExtractions` |
| Re-check | `recheckRequests.*`, `deviations.*` | `recheckRequests`, `deviations` |
| Audit | `audit()` in `server/routers.ts` | `auditEvents` |

## Source of truth

The server and database are authoritative. React views are derived from tRPC query responses and are refreshed every five seconds for operational pages. A QR is only a signed locator for an `examPaper` and session; the server resolves all displayed metadata from the database.
