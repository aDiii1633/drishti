# DRISHTI Data Model

Core tables are `users`, `examSessions`, `examPapers`, `markingSchemes`, `bundles`, `documents`, `pageChecks`, `bundleAssignments`, `answerExtractions`, `evaluations`, `teacherAnnotations`, `deviations`, `recheckRequests`, `generations`, and `auditEvents`.

Production additions are `users.centerName`, `users.isActive`, `users.mustChangePassword`, `bundles.candidateDob`, `bundles.idempotencyKey`, and paper QR metadata (`className`, `setNumber`, `bundleLabel`, `expectedQuestionCount`, `qrStatus`, `qrSchemaVersion`, `qrIssuedAt`, `qrExpiresAt`). Migration: `0008_production_runtime.sql`.

Candidate identity is stored on the bundle as name, candidate ID, date of birth, and optional school ID. Re-check lookup requires exact normalized name and ID plus exact date of birth. Password hashes and provider secrets are never returned by staff APIs.
