# DRISHTI Entity Relationship Map

`bundles` is the existing answer-sheet record. It is not a separate paper-bundle abstraction: one bundle stores one candidate's captured answer booklet and its operational state.

```mermaid
erDiagram
  USERS ||--o| EVALUATOR_PROFILES : has
  USERS ||--o{ EXAM_SESSIONS : creates
  EXAM_SESSIONS ||--o{ EXAM_PAPERS : contains
  MARKING_SCHEMES ||--o{ EXAM_PAPERS : defines
  EXAM_PAPERS ||--o{ BUNDLES : identifies
  BUNDLES ||--o{ DOCUMENTS : stores
  BUNDLES ||--o{ PAGE_CHECKS : validates
  BUNDLES ||--o{ BUNDLE_ASSIGNMENTS : assigned
  USERS ||--o{ BUNDLE_ASSIGNMENTS : evaluates
  BUNDLES ||--o{ EVALUATIONS : receives
  BUNDLES ||--o{ DEVIATIONS : may_open
  BUNDLES ||--o{ RECHECK_REQUESTS : may_receive
  BUNDLES ||--o{ AUDIT_EVENTS : records
```

## Relationship rules

- `examPapers.examSessionId` establishes session isolation for every QR-linked answer sheet.
- `bundles.examPaperId`, `bundles.intakeQrToken`, and `bundles.schemeId` are populated from the verified QR context at scanner intake.
- `bundleAssignments` is the sole evaluator-assignment record; only its evaluator can access that bundle from the evaluator desk.
- A student re-check request is linked by `recheckRequests.bundleId`. A re-checker can access that answer sheet when either an assigned deviation or an assigned student request exists.
- `documents`, `pageChecks`, `evaluations`, `deviations`, and `auditEvents` all retain the bundle id, maintaining a single answer-sheet lineage.
