# DRISHTI Demo Runbook

## Configuration

Use an isolated demo database. Do not point `DEMO_DATABASE_URL` at a
production database.

```env
APP_MODE=demo
DATABASE_URL=file:local-data/drishti.db
DEMO_DATABASE_URL=file:local-data/drishti-demo.db
SARVAM_API_KEY=
AI_PROVIDER=xai
XAI_API_KEY=
XAI_MODEL=grok-4.20-reasoning
```

Apply migrations to the demo database once:

```powershell
$env:DATABASE_URL='file:local-data/drishti-demo.db'
pnpm exec drizzle-kit migrate
```

Seed or reset only while `APP_MODE=demo`:

```powershell
pnpm data:seed-demo
pnpm data:clear-demo
pnpm data:seed-demo
```

`data:clear-demo` refuses to run outside demo mode. It follows explicit demo
ownership and its dependent bundle records before deleting files.

## Demo Flow

1. Sign in as `demo-admin` and inspect the open Mathematics 041 paper.
2. Sign in as `demo-scanner`, scan the signed paper QR from the admin paper
   configuration, then upload a sharp image for `Aarohi Kapoor`, candidate ID
   `DEMO-1001`, date of birth `2008-05-14`.
3. Submit the captured answer sheet. The database state becomes
   `ready_for_evaluation`.
4. As admin, assign it to `demo-evaluator`.
5. As evaluator, start Sarvam Vision for each question, poll the real job, and
   then request xAI grading. Both stages use server-only credentials.
6. Save human decisions and submit the evaluation. Open re-checking on the
   session if needed.
7. Sign in as `demo-student` to see only the linked record. When a finalized
   result QR exists, create the re-check request; assign it to
   `demo-rechecker` as admin and resolve it there.

The existing dashboards poll real database queries. They are not local counter
simulations; a capture, assignment, submission, or re-check changes the next
server refresh for the authorized user.

## Provider Failures

Without `SARVAM_API_KEY`, OCR stores a failed extraction and reports the
configuration error. Without `XAI_API_KEY`, grading returns the provider error.
Neither path creates a substitute extraction, confidence, score, or success
message. Manual evaluation remains available through the existing workspace.
