# DRISHTI AI Pipeline

The AI path is optional assistance, not the final authority.

1. A QR-linked answer sheet carries the matching marking scheme.
2. Stored answer-booklet and question-paper artifacts are supplied to the configured document-capable provider.
3. `gradeEngine.ts` validates structured AI output against known marking-scheme question ids and clamps marks to each question maximum.
4. AI results are persisted with provider/model metadata, feedback, confidence, and generation records.
5. The evaluator reviews each question and writes the human mark and decision.
6. A material AI/human difference can create a `deviations` record for re-check.

External model credentials and provider availability are required for live AI calls. In real mode, the system does not substitute fabricated AI marks.
