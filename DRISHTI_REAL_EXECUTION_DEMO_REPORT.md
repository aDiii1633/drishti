# DRISHTI REAL EXECUTION ON DEMO DATA REPORT

## 1. Demo Environment

Demo mode is isolated with `APP_MODE=demo` and `DEMO_DATABASE_URL`.

## 2. Demo Seed Data

Five role users, one school, two student records, one open session, one paper,
one signed QR, and a persisted three-question marking scheme are seeded.

## 3. Data Relationships

Student -> school -> session -> paper -> signed QR -> scanner capture -> bundle
is linked in the database. A scanner capture resolves the enrolled student.

## 4. Real Authentication

Demo users use the existing scrypt password and role-session authentication.
There is no login bypass.

## 5. Real QR

The seeded QR is signed by the existing HMAC QR service and is resolved through
the existing operator/admin API.

## 6. Real Scanner

The scanner uses the normal QR-first capture mutation and requires an enrolled
demo identity for a demo paper.

## 7. Real Storage

Captured files are written to the configured local storage provider and a
document record stores the resulting key and URL.

## 8. Real Processing

No processing rows are seeded. Capture, submission, assignment, OCR, grading,
and human submission are the same production mutations.

## 9. Real OCR and AI

The repository contains a Gemini question-first evidence and grading path. OCR/answer extraction is a separate configured stage; the local code does not claim a built-in handwriting OCR engine. Missing provider configuration fails visibly by design.

## 11. Real AI Grading

The demo-only grading and extraction branches were removed. No score,
confidence, or explanation is manufactured in demo mode.

## 12. Real Human Evaluation

The evaluator uses the existing saved decisions, annotations, and submission
validation after a real extraction and grade are available.

## 13. Real Assignment

Admin assignment creates the existing `bundleAssignments` row and sets the
bundle state to `assigned`.

## 14. Real Admin Realtime

Admin metrics are derived from database bundles and refresh through the
existing server polling query.

## 15. Real Evaluator Realtime

Evaluator assignments are queried from the persisted assignment table through
the existing refresh path.

## 16. Real Re-check

The student portal is linked to student-owned bundles. The existing re-check
request and re-checker workflow continue to enforce assignments server-side.

## 17. Security

Role, center, assignment, and student ownership checks remain server-side.
External credentials are server-only and failures are not converted to success.

## 18. Demo/Real Separation

Demo mode uses a separate database URL. Real mode uses only `DATABASE_URL` and
does not auto-seed demo business data.

## 19. Demo Reset Safety

Reset requires demo mode, selects explicit demo roots and their dependent
bundles, then removes only those documents and storage keys.

## 20. Multi-Window Realtime Test

The authorized polling refresh path is available for each workspace. A manual
multiple-browser interaction test still requires configured external providers
to reach the AI and finalization stages.

## 21. End-to-End Test

`pnpm test:demo-lifecycle` proved password verification, signed QR resolution,
invalid QR rejection, stored scanner capture, assignment, and evaluator
visibility against the isolated demo database. Missing Sarvam configuration was
observed as a real OCR failure.

## 22. Failures Found

The prior seed routine inserted synthetic answer sheets, OCR, AI grades, and
assignments. Those mock paths were removed.

## 23. Files Modified

`drizzle/schema.ts`, `server/db.ts`, `server/demoData.ts`, `server/routers.ts`,
`server/aiGrading.ts`, role and route UI files, scripts, environment examples,
and package scripts were updated.

## 24. Files Created

Migration `0010_real_demo_execution.sql`, the seed and lifecycle scripts,
student portal, runbook, and this report were created.

## 25. EXACTLY WHAT IS REAL

Authentication, authorization, database persistence, signed QR validation,
storage, scanner capture, assignment, evaluator visibility, human review,
re-check flow, audit, and polling all use live application code.

## 26. EXACTLY WHAT IS SEEDED

Only users, a school, students, one session, one paper, one marking scheme,
and its signed QR are seeded.

## 27. EXACTLY WHAT IS STILL BLOCKED

Physical ESP32 capture requires the external ScanGate firmware/service and a connected, handshaking device. The current 2026-08-28 serial-port probe did not list a matching COM17 device. Live Gemini execution requires the server-side key and network access; those credentials are never returned to the browser.

## 28. FINAL STATUS

PARTIAL
