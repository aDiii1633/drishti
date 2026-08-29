# DRISHTI Database

## Current persistence

Drizzle maps the SQLite/libSQL schema in `drizzle/schema.ts`. Migrations are stored under `drizzle/` and are applied with the project database command. Real mode uses `DATABASE_URL`; demo mode requires the isolated `DEMO_DATABASE_URL` and never reuses the real URL.

## Main entities

`users`, `schools`, `students`, `examSessions`, `examPapers`, `markingSchemes`, `bundles`, `documents`, `pageChecks`, `bundleAssignments`, `answerExtractions`, `evaluations`, `teacherAnnotations`, `deviations`, `recheckRequests`, `generations` and `auditEvents`.

## Data rules

- Intake QR tokens are signed and linked to an active exam paper/session.
- Bundle writes retain source/device and idempotency information.
- Evaluator procedures are assignment-scoped; student procedures are ownership-scoped.
- AI output is persisted with provider, model, prompt/rubric version and review state.
- Passwords are stored only as scrypt hashes.

## Production gap

The scanner flow performs several related writes and currently relies on application-level sequencing. Add a database transaction or compensating cleanup before high-concurrency deployment. Local filesystem artifacts also need durable private object storage and backup policy.
