import type { SchemeQuestion } from "../shared/drishti";

export class QuestionSetValidationError extends Error {}

function splitMarks(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

/**
 * Normalizes the richer authoring fields while preserving the existing question
 * record as the only source used by QR intake, OCR, and grading.
 */
export function normalizeQuestionSet(questions: SchemeQuestion[]): SchemeQuestion[] {
  return questions.map((question, index) => {
    const keyPoints = Array.from(
      new Set((question.keyPoints ?? []).map(point => point.trim()).filter(Boolean)),
    );
    const requiredConcepts = Array.from(
      new Set((question.requiredConcepts ?? keyPoints).map(point => point.trim()).filter(Boolean)),
    );
    const rawRubric = question.rubric?.map(criterion => ({
      id: criterion.id.trim(),
      label: criterion.label.trim(),
      maximumMarks: Number(criterion.maximumMarks),
    })).filter(criterion => criterion.id && criterion.label && Number.isInteger(criterion.maximumMarks) && criterion.maximumMarks > 0);
    const rubricPoints = keyPoints.slice(0, Math.max(1, Math.min(keyPoints.length, Number(question.maximumMarks))));
    const rubric = rawRubric?.length
      ? rawRubric
      : rubricPoints.map((point, rubricIndex) => ({
          id: `${question.id.trim()}-criterion-${rubricIndex + 1}`,
          label: point,
          maximumMarks: splitMarks(Number(question.maximumMarks), rubricPoints.length)[rubricIndex],
        }));

    return {
      ...question,
      id: question.id.trim(),
      label: question.label.trim(),
      questionNumber: question.questionNumber ?? question.id.trim(),
      questionText: question.questionText?.trim() || question.label.trim(),
      maximumMarks: Number(question.maximumMarks),
      order: Number.isInteger(question.order) && (question.order ?? 0) > 0 ? question.order : index + 1,
      section: question.section?.trim() || undefined,
      keywords: Array.from(new Set((question.keywords ?? []).map(keyword => keyword.trim()).filter(Boolean))),
      keyPoints,
      requiredConcepts,
      rubric,
    };
  });
}

export function validateQuestionSet(
  rawQuestions: SchemeQuestion[],
  maximumMarks: number,
  expectedQuestionCount?: number,
) {
  const questions = normalizeQuestionSet(rawQuestions);
  if (!Number.isInteger(maximumMarks) || maximumMarks <= 0)
    throw new QuestionSetValidationError("Paper maximum marks must be a positive whole number.");
  if (!questions.length)
    throw new QuestionSetValidationError("Add at least one question before creating a QR.");
  if (expectedQuestionCount !== undefined && questions.length !== expectedQuestionCount)
    throw new QuestionSetValidationError(`The question set has ${questions.length} questions; the paper expects ${expectedQuestionCount}.`);

  const ids = new Set<string>();
  const order = new Set<number>();
  for (const question of questions) {
    if (!question.id || !question.label || !question.questionText || question.questionText.length < 3)
      throw new QuestionSetValidationError("Every question needs a unique number and its full question text.");
    if (!Number.isInteger(question.maximumMarks) || question.maximumMarks <= 0)
      throw new QuestionSetValidationError(`Question ${question.id} needs a positive whole-number maximum.`);
    if (ids.has(question.id.toLowerCase()))
      throw new QuestionSetValidationError(`Question number ${question.id} is duplicated.`);
    if (order.has(question.order ?? 0))
      throw new QuestionSetValidationError(`Question order ${question.order} is duplicated.`);
    if (!question.keyPoints.length || !question.requiredConcepts?.length || !question.rubric?.length)
      throw new QuestionSetValidationError(`Question ${question.id} needs required concepts and at least one scoring criterion.`);
    const rubricTotal = question.rubric.reduce((sum, criterion) => sum + criterion.maximumMarks, 0);
    if (rubricTotal !== question.maximumMarks)
      throw new QuestionSetValidationError(`Question ${question.id} rubric totals ${rubricTotal}, not ${question.maximumMarks}.`);
    ids.add(question.id.toLowerCase());
    order.add(question.order ?? 0);
  }

  const total = questions.reduce((sum, question) => sum + question.maximumMarks, 0);
  if (total !== maximumMarks)
    throw new QuestionSetValidationError(`Question maxima total ${total}; the paper total must be exactly ${maximumMarks}.`);
  return questions;
}

export function questionSetVersion(schemeId: string) {
  return `question-set:${schemeId}`;
}
