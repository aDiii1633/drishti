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

## Validation

```bash
pnpm check
pnpm test
pnpm build
```

## Local data

SQLite data, uploaded PDFs, generated files, logs, build output, and environment secrets are excluded from Git. Local storage is created under `local-data/` and `local-storage/` when the app runs.

## Main workflows

- Upload a question paper and answer booklet.
- Inspect every rendered page and replace blurry scans.
- Attach or extract a question-and-marks setup.
- Record teacher marks and request AI grading.
- Review deviations of three marks or more.
- Finalize a QR-verifiable examination artifact.
