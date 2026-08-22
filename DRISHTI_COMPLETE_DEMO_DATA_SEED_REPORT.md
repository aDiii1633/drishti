# DRISHTI Complete Demo Data Seed Report

## 1. Seed Mode
Complete for local `APP_MODE=demo` using the existing SQLite database and storage adapters.

## 2. Reset Safety
`pnpm data:clear-demo` removes only demo-tagged users, schools, session, schemes, bundles, artifacts, calibration samples, and related records.

## 3. Centre
One demonstration centre is represented by the existing `centerName` architecture: `DRISHTI Demonstration Examination Centre`.

## 4. Schools
Five active schools are seeded across New Delhi, Lucknow, Jaipur, Chandigarh, and Bhopal.

## 5. School Administrators
Five school-admin accounts are seeded, each scoped to exactly one school.

## 6. Students
Thirty candidate records are seeded, with six students per school and one enrolled student portal identity.

## 7. Exam Session
One open Class XII demonstration examination session is seeded with an open re-check window.

## 8. Subjects
Mathematics, Physics, English, Computer Science, and Hindi are seeded.

## 9. Papers
Five paper bundles are seeded with subject codes, set numbers, maximum marks, and attached marking schemes.

## 10. Marking Schemes
Each paper has four rubric questions with maximum marks and key-point criteria.

## 11. QR Lifecycle
Five signed, active intake QR tokens are seeded for a friction-free scanner demonstration. Expiry and revocation remain covered by automated tests and the admin QR controls.

## 12. Scanner Accounts
Two operator accounts are seeded for the primary and backup scan desks.

## 13. Answer-Sheet Bundles
Twenty-five relational answer-sheet bundles are seeded across students, schools, papers, scanners, capture sources, and processing states.

## 14. Processing States
The dataset includes `saved`, `ready_for_evaluation`, `assigned`, `grading`, `submitted`, `completed`, and `recheck_required` states.

## 15. Stored Artifacts
Each bundle has a synthetic answer-sheet artifact and question-paper artifact. Completed/re-check records also have a final-result PDF artifact.

## 16. Page Checks
Each seeded bundle has a persisted clear-page clarity check and synthetic capture metadata.

## 17. Evaluators
Five evaluator users and five evaluator profiles are seeded, one per subject.

## 18. Assignments
Ten evaluator assignments are seeded for active grading and submitted/completed records. Ready and saved records remain unassigned.

## 19. Historical AI Records
Twenty historical evaluation records are seeded per completed workflow record. They are explicitly labelled `historical-demo` and do not bypass live AI execution.

## 20. Human Review
Historical human marks, AI marks, decisions, comments, confidence, rubric versions, and review roles are persisted.

## 21. Deviations
A controlled historical score deviation is included for audit and review demonstrations.

## 22. Annotations
Evaluator check and comment annotations are persisted on representative bundles.

## 23. Student Result
The enrolled demonstration student has completed records suitable for the existing student result flow.

## 24. Re-Check
One open student re-check request is linked to the enrolled student’s completed bundle and is visible to the existing admin workflow.

## 25. Audit Trail
Capture, assignment, and historical marking audit events are persisted against bundles.

## 26. Authentication
Local email/password authentication is active as requested. Supabase is not required for demo login.

## 27. Demo Credentials
All seeded demo accounts use the local-only `DRISHTI_DEMO_PASSWORD` value. Primary IDs are `admin.demo@example.com`, `school.demo@example.com`, `scanner.demo@example.com`, `evaluator.demo@example.com`, and `student.demo@example.com`. Additional school, scanner, and subject evaluator accounts are returned by the seed command.

## 28. Integrity Validation
The integrity check reports 5 schools, 30 students, 5 papers, 25 bundles, 5 evaluators, 10 assignments, 20 evaluations, 54 stored artifacts, 1 re-check request, and zero orphan links.

## 29. Live Workflow Validation
The existing lifecycle test passes signed QR resolution, scanner capture, storage persistence, admin assignment, exact school isolation, evaluator visibility, and the real Sarvam OCR configuration path. Without `SARVAM_API_KEY`, OCR fails with the configured server-side error rather than a fake result.

## 30. Verification Commands
`pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:demo-integrity`, and `pnpm test:demo-lifecycle` pass. Run `pnpm data:clear-demo` followed by `pnpm data:seed-demo` to reset and repopulate only the local demo dataset.
