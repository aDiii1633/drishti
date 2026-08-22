# DRISHTI Data Lifecycle

1. An admin creates an `examSession`, a `markingScheme`, and an `examPaper`.
2. Paper creation issues a signed HMAC intake QR tied to the paper id and session id.
3. The scanner resolves the QR. The server validates signature, token registration, paper status, QR expiry, session status, and staff-center access.
4. The scanner submits candidate name, candidate id, date of birth, and a real image. The server writes the answer-sheet `bundle`, its `document`, `pageCheck`, and audit record.
5. The scanner submits the saved capture, moving it into the evaluator queue.
6. The admin assigns an active evaluator only when that evaluator's center and configured subject match the QR-owned paper data.
7. AI extraction and grading write generation/evaluation records; the evaluator writes human decisions against the same marking scheme.
8. Finalization writes final artifacts and verification data. Student re-check identity requires normalized name, candidate id, date of birth, and the final verification token.
9. Re-check actions and every important transition write `auditEvents`.

The current SQLite adapter performs individual writes. Cross-table intake writes are idempotent through `bundles.idempotencyKey`; a database transaction wrapper is still a production-hardening follow-up for multi-write failure recovery.
