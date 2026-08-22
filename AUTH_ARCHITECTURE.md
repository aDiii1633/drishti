# DRISHTI Authentication Architecture

DRISHTI uses Supabase Email Auth as the password and email-OTP authority. The role picker is only a workspace choice; the server permits access only after the verified Supabase identity matches an active application profile with the selected role.

## Login

1. Supabase verifies the email and password.
2. Supabase sends an email OTP.
3. Supabase verifies the OTP and creates the browser session.
4. DRISHTI validates the access token server-side and resolves the linked `supabaseUserId`, email, profile status, and role.
5. A short-lived HTTP-only DRISHTI role session is created.

The current Supabase access token accompanies each application request. The role session is rejected if the Supabase session is absent, invalid, revoked, or associated with another profile.

## Roles

Active roles are Center Admin (`admin`), School Admin (`school_admin`), Scanner (`operator`), Evaluator, and Student. Re-check requests remain student-facing and are handled by administrators; no re-checker account is active.

## Configuration

- Browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Server: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

The service-role key is required only for staff provisioning and must never be exposed in client code. Configure Supabase Email Auth, OTP template, SMTP/email provider, Site URL, and allowed redirect URLs before enabling live login.
