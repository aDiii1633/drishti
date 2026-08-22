# DRISHTI Realtime Event Map

DRISHTI currently uses short-interval authoritative refreshes, not WebSockets. Operational pages refetch tRPC data every five seconds; every refresh reads the server/database source of truth.

| Mutation | Records changed | Consumer refresh |
| --- | --- | --- |
| `exam.createPaper` / QR revoke | `examPapers`, `auditEvents` | admin exam setup |
| `bundles.captureImage` / append / submit | `bundles`, `documents`, `pageChecks`, `auditEvents` | scanner history, admin workspace |
| `admin.assignEvaluator` | `bundleAssignments`, `bundles`, `auditEvents` | evaluator queue, admin workspace |
| AI grade and evaluator submit | `evaluations`, `generations`, `bundles`, `auditEvents` | evaluator workspace, dashboards |
| re-check request / assignment / resolution | `recheckRequests` or `deviations`, `auditEvents` | re-checker workspace, admin console |

Polling is correct for the current local deployment and avoids stale client-owned counters. A future horizontal production deployment should replace or supplement this with authenticated server-sent events or WebSockets.
