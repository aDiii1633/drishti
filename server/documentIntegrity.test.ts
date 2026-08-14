import { describe, expect, it } from "vitest";
import { bundleDocumentIntegrity } from "./documentIntegrity";

describe("bundle document artifacts", () => {
  it("requires the question paper and answer booklet for every bundle", () => {
    expect(bundleDocumentIntegrity(["questionPaper", "answerBooklet"], false)).toEqual({ hasQuestionPaper: true, hasAnswerBooklet: true, hasFinalPdf: true });
  });

  it("requires a final PDF only after the bundle moves into review", () => {
    expect(bundleDocumentIntegrity(["questionPaper", "answerBooklet"], true).hasFinalPdf).toBe(false);
    expect(bundleDocumentIntegrity(["questionPaper", "answerBooklet", "replacementPage", "finalPdf"], true)).toEqual({ hasQuestionPaper: true, hasAnswerBooklet: true, hasFinalPdf: true });
  });
});
