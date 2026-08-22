import type { DrishtiRole } from "../shared/drishti";

type KnowledgeEntry = {
  id: string;
  roles?: DrishtiRole[];
  text: string;
};

// This is deliberately structured as a small, editable product knowledge base.
// New approved guidance can be added here without changing the assistant runtime.
const knowledge: KnowledgeEntry[] = [
  {
    id: "product",
    text: "DRISHTI is an examination evaluation platform. It supports QR-linked answer-sheet intake, scanning, question-wise on-screen marking, AI-assisted suggestions, human verification, auditing, result finalization, and controlled re-check requests.",
  },
  {
    id: "osm",
    text: "In DRISHTI, OSM means on-screen marking: the evaluator reviews stored answer-sheet evidence, uses the configured question set and maximum marks, records a human mark, and saves each decision. AI marks are suggestions only; the evaluator's saved decision is the operational mark before finalization.",
  },
  {
    id: "scanner",
    roles: ["operator", "admin"],
    text: "Scanner workflow: scan a registered paper QR first, confirm the detected exam paper, capture all answer-sheet pages, check clarity, store the answer sheet, and submit intake. Invalid, revoked, expired, or mismatched QR codes must be scanned again from a current registered paper bundle.",
  },
  {
    id: "evaluator",
    roles: ["evaluator", "admin"],
    text: "Evaluator workflow: open only an assigned paper, review each answer against its question and rubric, use annotations when useful, save every human mark within the configured maximum, resolve review-required items, then finalize only after all required questions have a saved decision. A finalized paper is read-only.",
  },
  {
    id: "student",
    roles: ["student", "school_admin", "admin"],
    text: "Student support: a student can view only their own authorized examination record. A re-check request is available only for a finalized result when the related examination's re-check window is open. A request is reviewed through the existing re-check workflow; the assistant cannot change marks or submit a request on the student's behalf.",
  },
  {
    id: "school",
    roles: ["school_admin", "admin"],
    text: "School administration is tenant-scoped. School administrators can see only their own school's intake and result status. They cannot access another school's candidates, answer sheets, or results.",
  },
  {
    id: "admin",
    roles: ["admin"],
    text: "Center Admin manages examination sessions, papers, QR issuance, evaluator assignment, operational status, and re-check windows. High-impact changes continue to use the existing DRISHTI controls and require explicit confirmation outside the assistant.",
  },
];

export function projectKnowledgeFor(role: DrishtiRole) {
  return knowledge
    .filter(entry => !entry.roles || entry.roles.includes(role))
    .map(entry => entry.text)
    .join("\n\n");
}
