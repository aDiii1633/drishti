# DRISHTI QR Workflow

An admin must select an existing marking setup and enter session, subject, paper code, class, set, bundle label, maximum marks, and expected question count. The server verifies the question count and marks against the structured marking setup and rejects duplicate active paper/session/set combinations.

The server issues `DRISHTI-INTAKE:<claims>.<hmac>` with schema version, paper ID, session ID, issue time, and optional expiry. Scanner resolution verifies the signature, version, expiry, database token equality, paper status, QR status, and open session. Admin can revoke a QR. Creation, rejection, and revocation are audited.

Legacy unsigned intake tokens are intentionally rejected in real mode and should be replaced with newly generated signed QR codes.
