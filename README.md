# Drishti

Drishti is a forensic answer-evaluation workspace for scan intake, page-clarity review, teacher marking, AI-assisted grading, moderation, and QR-verifiable examination records.

## Run locally

Requirements: Node.js 20+ and pnpm.

```bash
pnpm install
copy .env.example .env
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env` and provide local values. Never commit `.env` files.

- `JWT_SECRET`: signs authenticated role sessions.
- `QR_SIGNING_SECRET`: signs intake QR tokens. It may be distinct from `JWT_SECRET`.
- `DATABASE_URL`: primary database connection.
- `DEMO_DATABASE_URL`: separate local database used only when `APP_MODE=demo`.
- `APP_MODE` and `DEMO_MODE`: choose real or demonstration runtime behavior.
- `DRISHTI_DEMO_PASSWORD`: local-only password used to seed demonstration accounts.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and `OPENROUTER_BASE_URL`: server-side AI grading configuration.
- `SCANGATE_ADAPTER`, `SCANGATE_BASE_URL`, `SCANGATE_REVIEWER_TOKEN`, and `SCANGATE_STATION_CODE`: ScanGate capture gateway configuration.
- `SCANGATE_USB_AGENT_URL`, `SCANGATE_USB_EXPECTED_DEVICE_ID`, `SCANGATE_USB_EXPECTED_VID_PID`, `SCANGATE_USB_PORT`, `SCANGATE_USB_BAUD_RATE`, `SCANGATE_USB_INGEST_URL`, and `SCANGATE_USB_INGEST_TOKEN`: local ESP32 USB capture bridge configuration.
- `OFFICIAL_EMAIL_DOMAIN`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY`: optional hosted authentication and platform integration settings.

Create a local role account before using the dedicated login pages:

```bash
pnpm auth:user -- --role admin --email admin@example.com --password "use-a-long-password" --name "Drishti Admin"
```

Use `school_admin`, `evaluator`, `student`, or `scanner` (mapped to the existing `operator` scan-operator role) for the other roles. Passwords are stored as server-side scrypt hashes; DRISHTI never stores or returns a plaintext password.

## Validation

```bash
pnpm check
pnpm test
pnpm build
```

## Local data

SQLite data, uploaded PDFs, generated files, logs, build output, and environment secrets are excluded from Git. Local storage is created under `local-data/` and `local-storage/` when the app runs.

## Main workflows

- Choose Admin, School Admin, Evaluator, Scanner, or Student from the role-selection screen.
- Admins can create an exam session, register subject/paper bundles, open scanning, and print intake QR labels.
- Scanner capture resolves the registered intake QR before saving answer-sheet pages and submitting the bundle.
- Admins assign submitted bundles to evaluators and resolve student re-check requests through the admin review workflow.
- Scanner capture supports a real camera flow and truthful hardware-scanner image input.

- Upload a question paper and answer booklet.
- Inspect every rendered page and replace blurry scans.
- Attach or extract a question-and-marks setup.
- Record teacher marks and request AI grading.
- Review deviations of three marks or more.
- Finalize a QR-verifiable examination artifact.
