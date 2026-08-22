# DRISHTI Authorization Matrix

| Capability | Admin | Operator | Evaluator | Re-checker | Student/public |
| --- | --- | --- | --- | --- | --- |
| Create sessions, papers, QR | yes | no | no | no | no |
| Resolve intake QR | yes | yes | no | no | no |
| Capture and submit scanner pages | yes | own captures only | no | no | no |
| Assign evaluator/re-checker | yes | no | no | no | no |
| View and mark answer sheet | yes | no | assigned only | assigned deviation/request only | no |
| Finalize result | yes | no | no | no | no |
| Request re-check | no | no | no | no | finalized identity-matched record only |
| Resolve student re-check | yes | no | no | assigned request only | no |

All protected tRPC procedures require a role session. Password login requires a matching active user role and password hash. QR scanner access and evaluator assignment enforce exam-center matching when the staff profile has a center. Evaluator assignment also enforces a configured matching subject.
