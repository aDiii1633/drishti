# DRISHTI Exam Configuration Flow

1. Sign in as an admin and create an examination session with center name and optional re-check end time.
2. Create a marking scheme in Teacher setup. The question count and total marks are explicit.
3. In Examination Control, select the session and the marking scheme; enter subject code, paper code, class, set, and bundle label.
4. Create the paper. DRISHTI validates the marking scheme total and question count, prevents an active duplicate within the same session/paper/set, and issues the signed QR payload.
5. Print the generated QR and attach it to the physical answer-sheet bundle.
6. Open the examination session. An operator must scan that QR before an answer-sheet capture can be saved.

The scanner never trusts editable subject or paper information after a QR resolves; it displays the server-resolved session, subject, code, class, set, bundle label, and question count.
