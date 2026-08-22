# DRISHTI Production Readiness

## Required configuration

- `APP_MODE=real`
- unique `JWT_SECRET` and `QR_SIGNING_SECRET` of at least 32 characters in production
- production `DATABASE_URL` with backups and access controls
- private storage credentials and bucket policy
- `SARVAM_API_KEY`, `XAI_API_KEY`, `AI_PROVIDER=xai`
- optional `OFFICIAL_EMAIL_DOMAIN` staff allowlist
- TLS termination, secure cookies, monitoring, rate limiting, and log retention

## Deployment gates

Run migrations, type check, tests, production build, signed-QR negative tests, role/object authorization tests, duplicate-submit tests, storage access tests, and an end-to-end exercise with real Sarvam/xAI credentials. Validate camera permissions and each supported physical scanner model at the deployment center.

## Current limitations

Realtime is five-second polling rather than WebSockets. The browser intake accepts real camera or uploaded image evidence but has no vendor-specific hardware bridge. External AI and physical device behavior cannot be certified without deployment credentials and hardware. Real mode fails visibly when providers are unavailable; it does not insert synthetic output.
