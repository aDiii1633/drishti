# DRISHTI Local Password Authentication

DRISHTI uses the normalized email address as the user ID and verifies the submitted password against a server-side scrypt hash. Successful credentials create a signed, role-scoped DRISHTI session cookie.

Passwords are never returned to the client, written to logs, or stored as plain text. Administrators provision staff accounts with a temporary password, and the account holder is required to set a new password at first sign-in.

The active roles are Center Admin, School Admin, Scanner, Evaluator, and Student. A School Admin profile has a persisted school assignment and can only access that school's answer-sheet records.

Demo mode seeds these accounts with the same local `DRISHTI_DEMO_PASSWORD` value:

- `admin.demo@example.com`
- `school.demo@example.com`
- `scanner.demo@example.com`
- `evaluator.demo@example.com`
- `student.demo@example.com`

Set this password only in the ignored local `.env` file before seeding demo data.
