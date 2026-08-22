# DRISHTI Scanner Workflow

The scanner desk must resolve a registered QR before creating an operator capture. The verified paper locks subject, paper, session, and marking setup. Camera, hardware-image intake, and file upload share the same storage and bundle mutation.

Candidate name, candidate ID, and date of birth are required. Client image clarity is checked before upload. The server stores the image, document metadata, page check, source/device, creator, and an idempotency key. Repeated first-page requests with the same user/key return the existing bundle. Additional pages append to that bundle. Submission changes processing state to `ready_for_evaluation`.

Physical scanner connectivity remains truthful: a file supplied by scanner hardware is accepted, but the product does not claim direct hardware connectivity without an installed device bridge.
