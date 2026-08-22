# Demo Data Map

`APP_MODE=demo` uses `DEMO_DATABASE_URL`, never `DATABASE_URL`. The seed creates real application records only: no answer-sheet files, OCR text, AI scores, assignments, or review decisions are pre-created.

```
DRISHTI Demonstration Examination Centre
  -> DRISHTI Demonstration Senior School
  -> Aarohi Kapoor and Vihaan Mehra
  -> DRISHTI Class XII Demonstration Examination 2026
  -> Mathematics 041 / Set A
  -> signed intake QR
```

Every root record carries `isDemo = true`. The demo profiles are email-auth application profiles:

| Role | Email |
| --- | --- |
| Center Admin | `admin.demo@example.com` |
| School Admin | `school.demo@example.com` |
| Scanner | `scanner.demo@example.com` |
| Evaluator | `evaluator.demo@example.com` |
| Student | `student.demo@example.com` |

Passwords and email OTPs are not stored in demo data. To sign in, provision matching Supabase users in the configured demo project.
