export type QuestionMarks = { maximumMarks: number };

export function questionMarksTotal(questions: QuestionMarks[]) {
  return questions.reduce((total, question) => total + Number(question.maximumMarks || 0), 0);
}

export function withinPaperMaximum(questions: QuestionMarks[], paperMaximum: number) {
  return questionMarksTotal(questions) <= paperMaximum;
}
