# DRISHTI FINAL AUTHENTICATION UPDATE REPORT

## 1. Phone Authentication Removed

Removed all active phone/SMS OTP procedures, UI, client helpers, and phone-auth tests. Historic database migration files remain only for migration history.

## 2. Email Login

Login ID is a normalized email address. The role login screen accepts Email / User ID and verifies it against the local DRISHTI account.

## 3. Password

Passwords are handled by DRISHTI's server-side scrypt password utility. Only salted password hashes are stored; plain-text passwords are never returned or logged.

## 4. Login Flow

Email / User ID + password -> local password verification -> role check -> signed DRISHTI session cookie -> authorized workspace.

## 5. Sign-Up Flow

No public staff sign-up is exposed. Staff accounts are provisioned by an administrator or the local `pnpm auth:user` utility. Students use pre-created application profiles.

## 6. Role Resolution

The application profile is resolved by normalized email/login ID. The selected role must match the stored role, and inactive profiles are rejected.

## 7. Role Isolation

Active roles are Center Admin (`admin`), School Admin (`school_admin`), Scanner (`operator`), Evaluator, and Student. A School Admin has a persisted `schoolId`; protected procedures only return bundles for that exact school.

## 8. Re-checker Removal

Re-checker role selection, login, navigation, protected routes, staff creation, and assignment endpoints were removed. Existing re-check history remains in the database.

## 9. Student Re-check

Students can still create a re-check request for their own finalized result during an open re-check window. Administrators operate the review workflow.

## 10. Demo Accounts

Demo accounts use these IDs: `admin.demo@example.com`, `school.demo@example.com`, `scanner.demo@example.com`, `evaluator.demo@example.com`, and `student.demo@example.com`.

Demo password: the local-only `DRISHTI_DEMO_PASSWORD` environment value.

## 11. Demo Data

Demo accounts, school, student records, exam session, paper, marking scheme, and signed QR are stored in the isolated demo database. The School Admin profile is assigned to the seeded school, and the old demo re-checker profile is removed during reseeding.

## 12. Realtime Tests

The local scanner -> School Admin scope check -> admin assignment -> evaluator visibility lifecycle passed. The existing UI continues to refresh backend state.

## 13. Security Tests

`pnpm test` passed: 25 test files, 62 tests, with 2 intentionally skipped external-provider tests. `pnpm test:demo-lifecycle` passed, including the seeded scanner email/password login. `pnpm check` and `pnpm build` passed.

## 14. UI/UX Updates

Role login now uses a single email/password form. The password-change screen supports temporary staff passwords. Phone controls and re-checker entry points are absent.

## 15. Files Modified

Core changes include `client/src/pages/RoleLogin.tsx`, `client/src/pages/PasswordChange.tsx`, `client/src/pages/Protected.tsx`, `client/src/main.tsx`, `server/passwordAuth.ts`, `server/routers.ts`, `server/_core/context.ts`, `server/roleAuth.ts`, `shared/drishti.ts`, `drizzle/schema.ts`, and the demo/provisioning scripts.

## 16. Files Created

`server/passwordAuth.ts`, `DRISHTI_LOCAL_AUTH.md`, `client/src/pages/SchoolAdminDashboard.tsx`, `drizzle/0012_school_admin_scope.sql`, and this report.

## 17. Remaining Issues

This is local application authentication. Production deployment should use a long random `JWT_SECRET`, HTTPS, rate limiting, and a managed secrets store. Demo credentials must not be reused for production.

## 18. FINAL STATUS

COMPLETE FOR LOCAL LOGIN

Local email/password login is implemented, demo credentials are seeded, and the role-scoped workflow has been tested. Supabase is no longer part of the active authentication path.
