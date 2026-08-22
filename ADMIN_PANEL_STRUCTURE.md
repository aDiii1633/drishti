# DRISHTI Admin Panel Structure

## Primary navigation

The Center Admin workspace has three primary destinations only:

1. Home (`/admin`)
2. Exam Sessions (`/admin/exams`)
3. Admin Console (`/admin/mongo`)

The shared icon rail is not rendered for the Admin role. Existing operational routes remain protected and available when a workflow links to them, but they are not primary Admin navigation.

## Home metrics

Home uses `dashboard.adminOverview`, an admin-only backend procedure that scopes records to the most recently updated open exam session.

| Metric | Source and definition |
|---|---|
| Schools | One registered center record for the current session (`examSessions.centerName`). The current schema has no separate school roster. |
| Evaluators | `users` rows whose role is `evaluator`. |
| Total Answer Sheets | `bundles` linked through `examPapers` to the current session. Each bundle is one answer sheet, regardless of page count. |
| Scanned | Session bundles whose `processingState` is not `captured`; these have been saved or moved into a later workflow stage. |
| Evaluated | Scanned bundles in `submitted`, `recheck_required`, or `completed`, plus finalized bundles. |
| Pending Evaluation | Scanned minus evaluated bundles. |

If there is no open session, the dashboard deliberately shows an empty operational state instead of historical or mixed-session totals.

## Refresh and authorization

The dashboard refreshes through the existing query layer every 15 seconds. `dashboard.adminOverview` is protected by the existing server-side `admin` role middleware; non-admin callers receive `FORBIDDEN` before dashboard data is queried.

## Existing operations

Exam-session controls, QR generation, assignments, re-check assignment, and audit access remain in their existing backend and Admin Console workflows. No underlying records or service procedures were removed by the navigation simplification.
