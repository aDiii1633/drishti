# Admin Workspace Structure

The administrator workspace uses one sidebar and no secondary icon rail. Its only primary destinations are Home, Schools, Evaluators, Total Answer Sheets, Scanned, Evaluated, Pending Evaluation, Exam Sessions, and Admin Console.

All live workspace lists are scoped to the most recently updated open exam session. Sidebar counts are supplied by the server-side overview query and refresh every 15 seconds.

Schools and evaluators have dedicated list and detail routes. Answer-sheet routes use server-side state filtering and server-side search; a candidate link opens the existing administration marking workspace for that bundle.
