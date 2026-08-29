# DRISHTI Demo Runbook

## Configuration

Use an isolated demo database. Do not point `DEMO_DATABASE_URL` at a
production database.

```env
APP_MODE=demo
DATABASE_URL=file:local-data/drishti.db
DEMO_DATABASE_URL=file:local-data/drishti-demo.db
GEMINI_API_KEY=
GEMINI_GRADING_MODEL=gemini-3.6-flash
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
   configuration, then upload a sharp answer-sheet image set or PDF.
3. Submit the captured answer sheet. The database state becomes
   `ready_for_evaluation`.
4. As admin, assign it to `demo-evaluator`.
5. As evaluator, request Gemini evidence mapping and question-first grading when
   configured. The provider uses server-only credentials.
6. Save human decisions and submit the evaluation. Open re-checking on the
   session if needed.
7. Sign in as `demo-student` to see only the linked record. When a finalized
   result QR exists, create the re-check request; assign it to
   `demo-rechecker` as admin and resolve it there.

The existing dashboards poll real database queries. They are not local counter
simulations; a capture, assignment, submission, or re-check changes the next
server refresh for the authorized user.

## Provider Failures

Without `GEMINI_API_KEY`, AI assistance returns a visible configuration error.
It does not create a substitute extraction, confidence, score, or success
message. Manual evaluation remains available through the existing workspace.
