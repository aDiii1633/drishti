# DRISHTI Debug Audit

## Scope reviewed

The current application is a React/Wouter frontend with an Express/tRPC backend, Drizzle/libSQL persistence, role-aware authentication, answer-sheet bundles, evaluator assignments, scanning, AI evaluation, audit logging, and re-check workflows. The review covered the active routes, shared layout, routers, database schema, authentication middleware, evaluator access checks, and the existing admin dashboard.

## Confirmed findings

### UI and UX

- The administrator shell no longer has the old icon rail, but its navigation currently exposes only Home, Exam sessions, and Admin console. It does not yet expose the requested school, evaluator, and answer-sheet work queues.
- The administrator dashboard exposes summary metrics but no dedicated operational lists or detail views. Users cannot drill from a metric into the relevant schools, evaluators, or answer sheets.
- Existing dashboard loading states are present, but failures from the live overview query are not surfaced clearly in the administrator view.
- Evaluator, scanner, moderator, and student layouts use their own role-specific navigation. This is appropriate and should remain isolated from the administrator experience.

### Frontend and routes

- Administrator routes are protected, and evaluator routes are separated from administrator routes.
- The requested administrator routes for schools, evaluators, all answer sheets, scanned sheets, evaluated sheets, and pending evaluation are missing.
- Existing evaluator direct-access protection correctly redirects unauthenticated users, and server-side bundle access checks prevent an evaluator from reading a bundle assigned to another evaluator.

### Backend and data model

- The application has canonical answer-sheet bundles, papers, sessions, evaluator assignments, audit events, and re-check records.
- There is no first-class school model or relationship from an answer-sheet bundle to a school/candidate identifier.
- There is no evaluator profile model for centre and subject metadata. Current assignment data only records the evaluator user and assigned bundle.
- The current administrator metrics use a centre-name proxy for schools and cannot support proper school-level drill-downs.
- There is no centralized, relational demo-data service. Existing temporary fixtures are test-only and are cleaned up after tests.

### Authorization and security

- Role checks are enforced both at the route boundary and in protected tRPC procedures.
- Evaluator bundle access is checked server-side, not only hidden in the UI.
- Credentials and external service configuration are environment-based. No secret values are embedded in the inspected source.
- The full test suite has one environment-dependent failure when ScaleMax credentials are absent. This is an integration-configuration gap, not a confirmed application logic failure.

### Missing operational states

- Administrator views need explicit loading, empty, and error states for the new data-driven lists.
- The system needs a clear demo-data boundary so data is generated only when `DEMO_MODE=true` and never overwrites non-demo records.

## Recommended remediation

1. Add school and evaluator-profile relationships without replacing the existing user, paper, bundle, or assignment models.
2. Add a server-side administrator workspace API that scopes queries to the active exam session and filters answer-sheet queues on the backend.
3. Add dedicated, protected administrator routes and a concise, count-bearing navigation menu.
4. Add an idempotent demo-data seed service behind `DEMO_MODE=true`, with linked schools, candidates, papers, bundles, assignments, evaluation states, and re-check records.
5. Improve administrator query error rendering and validate the complete flow with type checks, targeted backend tests, and browser checks.

## UI Problems

The administrator navigation lacked the required operational destinations and list drill-downs. This is repaired by the new single administrator sidebar and workspace pages.

## UX Problems

The former overview did not lead administrators from counts to work queues. Dedicated routes now make the next action explicit.

## Navigation Problems

Schools, evaluators, and answer-sheet workflow states were not first-class administrator destinations. The old administrator icon rail was already removed and remains absent.

## Frontend Errors

No browser runtime or console errors were reproduced in the tested administrator and evaluator routes.

## Backend Problems

The project had no school domain model, evaluator centre/subject profile, or session-scoped administrator workspace query layer. These are now additive database and API extensions.

## API Problems

The dashboard previously derived schools from a centre-name proxy. It now uses real school rows and uses server-side filters for answer-sheet lists and search.

## Data Problems

Bundles previously had no school or candidate identifier relationship. New nullable links preserve existing records while enabling proper future and demo relationships.

## Authentication Problems

No application authentication defect was reproduced. Demo credentials exist only because `DEMO_MODE=true` is enabled locally.

## Authorization Problems

No authorization bypass was reproduced. Role procedures and evaluator object-level bundle checks remain in place.

## Demo Data Problems

There was no centralized demo seed. The new idempotent seed creates connected sample data only under `DEMO_MODE=true`.

## Broken Pages

No tested route rendered blank or returned a 404. Demo marking pages correctly show a missing-evidence state because seed data does not manufacture scan documents.

## Broken Buttons

Tested login, sidebar, school detail, answer-sheet search, evaluator Assigned Papers, and existing marking links work.

## Broken Forms

No broken tested forms were found. Existing login and administrator assignment behaviour remain server-validated.

## Missing States

New administrator pages now include loading, empty, and error states. Existing marking remains honest about missing evidence and missing schemes.

## Missing Loading States

The new workspace queries render explicit loading text.

## Missing Error States

The dashboard overview and new workspace pages render explicit data-load failures.

## Inconsistent Components

The new pages use the existing white, sky-blue, and restrained panel styles.

## Duplicate Components

No duplicate administrator navigation system remains. Reusable data views use the same sidebar and protected route system.

## Route Problems

Required administrator workspace routes are now protected and available. Legacy role routes remain untouched for compatibility.

## Security Problems

The only unresolved verification requirement is external ScaleMax configuration; its credential integration test cannot run without the two configured secrets.
