import { describe, expect, it } from "vitest";
import { mapAnswerToQuestion } from "./questionMapping";

const questions = [
  { id: "Q1", label: "Define momentum.", maximumMarks: 2, keyPoints: ["mass", "velocity"] },
  { id: "Q2", label: "State Newton's second law.", maximumMarks: 3, keyPoints: ["force", "acceleration"] },
];

describe("mapAnswerToQuestion", () => {
  it("uses explicit question labels to isolate a response", () => {
    const result = mapAnswerToQuestion("Q1. Momentum is mass times velocity.\nQ2. Force equals mass times acceleration.", questions[0], 0, questions);
    expect(result.text).toContain("Momentum is mass times velocity");
    expect(result.text).not.toContain("Force equals");
    expect(result.confidence).toBe(86);
  });

  it("flags unlabelled OCR output for human review", () => {
    const result = mapAnswerToQuestion("A handwritten response without question labels.", questions[0], 0, questions);
    expect(result.strategy).toBe("document-fallback");
    expect(result.requiresHumanReview).toBe(true);
    expect(result.confidence).toBeLessThan(50);
  });
});
