# DRISHTI End-to-End Test

## Automated verification

Run:

```powershell
pnpm check
pnpm test
pnpm build
```

The test suite covers runtime-mode defaults, signed QR verification, operational metrics, role denials, re-check window choice, and answer-sheet state guards.

## Manual operational test

1. Create a new session, manual marking scheme, and QR paper bundle.
2. Open the session, sign in as a matching-center operator, resolve the QR, and capture a real JPG/PNG answer-sheet image with candidate name, id, and date of birth.
3. Submit the capture and assign it to a matching-subject evaluator.
4. Complete AI assistance only when provider credentials are configured; complete every human rubric decision and submit.
5. Finalize the result, open re-check for that exact session, and submit a student request using the verification token plus all three identity fields.
6. Assign the request to a re-checker, resolve it, and inspect the audit-event chronology.

Use two sessions during the test: a QR from one session must never be accepted as another session's paper, and the other session's re-check window must not control this request.
