# DRISHTI Evaluator Workflow

Admin assignment persists in `bundleAssignments`. Evaluator list/detail procedures filter by the authenticated evaluator user ID, preventing access to unassigned bundles.

The workspace reads pages and the structured marking setup from the database. Gemini provides optional question-first answer evidence mapping and rubric-bounded grading; failures remain visible and do not fabricate scores. The human evaluator can annotate, alter marks within the question maximum, and submit. Evaluation and audit records persist before dashboard updates.

Required production configuration for AI assistance: `GEMINI_API_KEY` and optional `GEMINI_GRADING_MODEL`. AI assistance is optional; manual marking remains the authority.
