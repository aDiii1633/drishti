# Drishti Verification Record

## Build and quality gates

| Check | Evidence | Result |
|---|---|---|
| Production compilation | `pnpm build` completed on 12 Aug 2026. | Passed. The Vite client and bundled Node server were produced successfully. |
| Type validation | `pnpm check` completed after the final implementation changes. | Passed with no TypeScript errors. |
| Automated suite | `pnpm test` completed after the final implementation changes. | Passed: 7 test files and 17 tests. |
| Desktop public UI | Captures of `/` and `/login` at 1280×720. | Passed. The landing page and role selector rendered without layout failures. |
| Mobile public UI | Captures of `/` and `/verify/not-a-valid-token` at 390×844. | Passed. The landing page and invalid-token verification state remained readable and responsive. |
| Unauthenticated protected routes | Captures of the dashboard, intake, marking, audit, history, answers, evaluations, and data-console paths. | Passed. Every route redirected to the role-selection screen rather than exposing protected content. |

## Rule and workflow safeguards

| Requirement | Implementation evidence | Automated evidence |
|---|---|---|
| Twelve-hour role session | `server/roleAuth.ts` creates a signed JWT with `expiresAt = issuedAt + 43,200` seconds. | `server/roleAuth.test.ts` verifies issuance, validation, and exact lifetime. |
| Four role gates | Operator, evaluator, moderator, and administrator sessions are gated by server procedures. | `server/rolePermissions.test.ts` denies evaluator access to the admin console and moderation procedures, and denies moderator access to intake. |
| Admin-only console | `admin.console` is guarded by `withRoles("admin")`; the client hides the navigation item for non-admin sessions. | `server/rolePermissions.test.ts` verifies evaluator denial before database access. |
| Blur labels | The browser renders each PDF page and calculates variance-of-Laplacian before assigning `CLEAR` or `BLURRY`. | Implemented in `client/src/lib/pdf.ts` and surfaced in `ScanIntake.tsx`. |
| Score clamping | Human inputs are bounded in the client and AI scores are clamped in the server grading engine. | `server/gradeEngine.test.ts` covers upper and lower score bounds. |
| Three-mark deviation gate | Deviations are created at a difference of `>= 3` marks. | `server/gradeEngine.test.ts` verifies the exact boundary. |
| Denominator precedence | Printed paper total precedes operator total; catalog fallback flags coverage incomplete. | `server/gradeEngine.test.ts` verifies all three branches. |
| Document integrity | Question paper, booklet, replacement page, and final PDF are persisted as separate document artifacts. | `server/bundleArtifacts.router.test.ts` drives create, replacement, finalize, and retrieval procedures. |
| QR verification | Final PDFs are stamped in-browser and verified through `/api/v1/qr/verify/:token`. | Mobile invalid-token capture confirms the public denial state. |

## Outstanding session-based visual check

The current screenshot harness verifies the public application and confirms that protected routes redirect when no role session is present. The server-side role tests prove allowed/denied procedure boundaries.

An authenticated administrator role was selected through the live role-badge screen. The resulting command desk rendered the administrator session label, the full dashboard navigation, and the **Data console** entry. This confirms that the twelve-hour role session is carried from selection into the protected application shell. The remaining role-specific visual acceptance pass is tracked in `todo.md`.

The administrator then opened `/dashboard/mongo` in the live application. The restricted console rendered its administrator-only heading and metadata counters. Ending that session returned directly to the role-badge selection screen, confirming the local session cleanup path.

An operator role was selected after administrator logout. The command desk rendered the **operator session** label and omitted the Data console navigation entry. The operator then opened `/dashboard/scan`, where the live page rendered the paired-PDF intake controls, marking-scheme selector, batch status, per-page clarity-report region, and the explicit rule that BLURRY pages must be replaced before QR-stamped finalization.

The operator session was then ended and the live application returned to the role-badge selection view, ready for independent evaluator and moderator acceptance checks.

An evaluator role was selected through the live role-badge screen. The protected shell identified the evaluator session, omitted the Data console navigation, and loaded `/dashboard/marking`. With no bundles in the test record, the workspace rendered its intentional empty state explaining that intake and a marking scheme are prerequisites; it did not expose an error or unauthorized state.

The evaluator session was ended and a moderator role was selected. The live command desk rendered the **moderator session** label and, as intended, did not expose Data console navigation. The audit studio is the remaining moderator workspace checked in this acceptance pass.

The moderator opened `/dashboard/audit` successfully. The live audit workspace displayed the moderation-ledger heading, the documented three-mark divergence rule, and its designed empty state for a record without deviations. The moderator session was then ended, returning the application to role selection. All four role badges have now been selected and their expected high-level access views confirmed in the live application.
