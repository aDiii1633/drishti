# DRISHTI Realtime Readiness

## Ready in the current local architecture

- Real mode is default and existing demo rows have been purged.
- Password role login, active-account checks, forced password change, role isolation, signed QR validation, scanner storage, evaluator assignment, human review, audit records, and session-specific re-check requests are database-backed.
- Client workspaces poll authoritative tRPC queries every five seconds.

## Required before a public production launch

- Configure a durable managed database and object storage backup/retention policy.
- Configure live document/AI provider credentials and monitor provider failures.
- Add database transactions or compensation for multi-record scanner capture writes.
- Add authenticated push events if five-second polling is insufficient at expected load.
- Complete physical scanner compatibility certification, accessibility testing, security penetration testing, and full multi-user browser end-to-end tests.
- Recreate any legacy paper record that predates required marking-scheme and signed-QR fields.
