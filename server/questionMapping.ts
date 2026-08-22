import type { SchemeQuestion } from "../shared/drishti";

export type AnswerMapping = {
  text: string;
  confidence: number;
  requiresHumanReview: boolean;
  strategy: "question-label" | "document-fallback";
};

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(question: SchemeQuestion, index: number) {
  const numeric = question.id.match(/(\d+)\s*$/)?.[1];
  const tokens = Array.from(new Set([question.id, numeric ? `Q${numeric}` : "", numeric ?? ""]))
    .filter(Boolean)
    .map(escapePattern);
  return new RegExp(`(?:^|\\n)\\s*(?:question\\s*)?(?:${tokens.join("|")})\\s*(?:[.):-]|\\n)`, "gi");
}

/**
 * Uses explicit handwritten/OCR question labels when they exist. If they do
 * not, it deliberately returns the document with a low confidence flag rather
 * than pretending that the answer boundaries are certain.
 */
export function mapAnswerToQuestion(
  documentText: string,
  question: SchemeQuestion,
  questionIndex: number,
  allQuestions: SchemeQuestion[],
): AnswerMapping {
  const text = documentText.trim();
  if (!text) return { text: "", confidence: 0, requiresHumanReview: true, strategy: "document-fallback" };
  const startPattern = labelPattern(question, questionIndex);
  const start = startPattern.exec(text);
  if (!start || start.index === undefined)
    return { text, confidence: 30, requiresHumanReview: true, strategy: "document-fallback" };

  const answerStart = start.index + start[0].length;
  const nextQuestion = allQuestions
    .slice(questionIndex + 1)
    .map((candidate, offset) => ({
      index: questionIndex + offset + 1,
      match: labelPattern(candidate, questionIndex + offset + 1).exec(text.slice(answerStart)),
    }))
    .find(candidate => candidate.match && candidate.match.index !== undefined);
  const answerEnd = nextQuestion?.match?.index === undefined
    ? text.length
    : answerStart + nextQuestion.match.index;
  const answer = text.slice(answerStart, answerEnd).trim();
  return {
    text: answer || text,
    confidence: answer ? 86 : 52,
    requiresHumanReview: !answer,
    strategy: "question-label",
  };
}
