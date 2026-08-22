import { describe, expect, it } from "vitest";
import { QuestionSetValidationError, validateQuestionSet } from "./questionSet";

const validQuestions = [
  { id: "Q1", label: "Define momentum.", maximumMarks: 2, keyPoints: ["mass", "velocity"] },
  { id: "Q2", label: "State Newton's second law.", maximumMarks: 3, keyPoints: ["force", "acceleration"] },
];

describe("validateQuestionSet", () => {
  it("normalizes a complete question set into criterion-level rubrics", () => {
    const questions = validateQuestionSet(validQuestions, 5, 2);
    expect(questions[0].rubric).toEqual([
      { id: "Q1-criterion-1", label: "mass", maximumMarks: 1 },
      { id: "Q1-criterion-2", label: "velocity", maximumMarks: 1 },
    ]);
    expect(questions[1].requiredConcepts).toEqual(["force", "acceleration"]);
  });

  it("rejects a duplicate question number before QR creation", () => {
    expect(() => validateQuestionSet([
      ...validQuestions,
      { id: "q1", label: "Duplicate question.", maximumMarks: 1, keyPoints: ["criterion"] },
    ], 6, 3)).toThrow(QuestionSetValidationError);
  });

  it("rejects totals that do not exactly match the configured paper", () => {
    expect(() => validateQuestionSet(validQuestions, 6, 2)).toThrow("Question maxima total 5");
  });
});
