# DRISHTI Realtime Events

Views use five-second controlled polling against database-backed tRPC queries. There is no in-process event bus dependency and no fake client event stream.

Important audit event names include `LOGIN_SUCCESS`, `PASSWORD_CHANGED`, `USER_CREATED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `QR_CREATED`, `QR_REJECTED`, `QR_REVOKED`, plus the existing bundle, assignment, OCR, evaluation, finalization, and re-check events.

Operational state transitions are committed first, then observed by polling clients. Idempotency protects paper creation, first capture, assignment, and student re-check creation from common retry duplication. A future WebSocket/SSE layer can subscribe to the same persisted state without changing workflow ownership.
