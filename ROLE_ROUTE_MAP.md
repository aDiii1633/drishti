# Drishti Role Route Map

## Public routes

`/` and `/role-selection` provide role entry. `/verify/:token` verifies finalized-record QR data.

## Workspaces

- Center Admin: `/admin/login` -> `/admin`
- School Admin: `/school-admin/login` -> `/school-admin`
- Evaluator: `/evaluator/login` -> `/evaluator`
- Scanner: `/scanner/login` -> `/scanner`
- Student: `/student/login` -> `/student`

Compatibility scanner aliases remain at `/operator/login`, `/photographer/login`, and `/photographer`.

## Enforcement

Every workspace route requires a verified Supabase-backed role session. Scanner access is restricted to scanner-owned captures, evaluator access to assigned papers, school administration to its school scope, and student access to the linked student record. Re-checker routes are not active.
