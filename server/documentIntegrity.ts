export type ArtifactType =
  | "questionPaper"
  | "answerBooklet"
  | "scanOriginal"
  | "replacementPage"
  | "finalPdf";

export function bundleDocumentIntegrity(
  types: Iterable<ArtifactType>,
  needsFinalPdf: boolean
) {
  const present = new Set(types);
  return {
    hasQuestionPaper: present.has("questionPaper"),
    hasAnswerBooklet: present.has("answerBooklet"),
    hasFinalPdf: needsFinalPdf ? present.has("finalPdf") : true,
  };
}
