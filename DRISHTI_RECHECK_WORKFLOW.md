# DRISHTI Re-check Workflow

Requests are accepted only while the current exam re-check window is open and only for finalized records. Public input requires final verification token, registered student name, candidate ID, date of birth, and reason.

The server performs exact normalized name/ID matching and exact date matching. Zero matches return no record; multiple matches return `IDENTITY_AMBIGUOUS`. A duplicate request for the same bundle and candidate returns the existing request. Admin assignment persists the re-checker user ID. Re-checker list/detail procedures expose only assigned requests, and final resolution is audited.

The verification page never exposes stored date of birth or other candidate identity fields.
