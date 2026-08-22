# DRISHTI Evaluator Workflow

Admin assignment persists in `bundleAssignments`. Evaluator list/detail procedures filter by the authenticated evaluator user ID, preventing access to unassigned bundles.

The workspace reads pages and the structured marking setup from the database. Sarvam Vision creates asynchronous answer extraction records. xAI is the default grading provider and returns rubric-bounded suggestions; failures remain visible and do not fabricate scores. The human evaluator can annotate, alter marks within the question maximum, and submit. Evaluation and audit records persist before dashboard updates.

Required production configuration: `SARVAM_API_KEY`, `XAI_API_KEY`, and `AI_PROVIDER=xai` (the provider defaults to xAI when omitted).
