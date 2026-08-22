# DRISHTI Debug Report

## Completed repair

- Added a first-class school model, evaluator profile metadata, and bundle-to-school/candidate links.
- Added server-scoped admin workspace APIs and dedicated, protected routes for schools, evaluators, and answer-sheet queues.
- Replaced the administrator's former centre-name school metric proxy with real school records.
- Added loading, empty, and error states to the new data-driven workspace pages and surfaced dashboard overview errors.
- Added an idempotent, relational `DEMO_MODE` seed service using the existing session, paper, bundle, assignment, evaluation, audit, and re-check models.
- Preserved role isolation, the existing assignment workflow, and the existing marking workspace.

## Verification

- Database migration `0005_admin_workspace_data.sql` applied successfully.
- Type check, production build, and targeted live admin metric test pass.
- Browser validation covered admin login, dashboard, sidebar counts, schools, school details, answer-sheet search, evaluator listing, and pending evaluation with no browser console errors.
- The full automated suite has one known environment-dependent failure: the ScaleMax credential integration test requires `SCALEMAX_BASE_URL` and `SCALEMAX_API_KEY`.
