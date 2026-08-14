import { describe, expect, it } from "vitest";
import {
  clampScore,
  gradeFailureDetail,
  normalizeGradePayload,
  requiresDeviation,
  resolveDenominator,
  validateExtractedSchemePayload,
} from "./gradeEngine";

describe("Drishti score safeguards", () => {
  it("always prioritizes the printed paper total over all fallbacks", () => {
    expect(
      resolveDenominator({
        printedMaximumMarks: 72,
        operatorConfirmedTotal: 80,
        catalogTotal: 90,
      })
    ).toMatchObject({ total: 72, source: "paper", coverageComplete: true });
  });

  it("uses an operator-confirmed total when no printed maximum is available", () => {
    expect(
      resolveDenominator({
        printedMaximumMarks: null,
        operatorConfirmedTotal: 64,
        catalogTotal: 80,
      })
    ).toMatchObject({ total: 64, source: "operator", coverageComplete: true });
  });

  it("marks the catalog fallback as incomplete", () => {
    expect(
      resolveDenominator({
        printedMaximumMarks: null,
        operatorConfirmedTotal: null,
        catalogTotal: 80,
      })
    ).toMatchObject({ total: 80, source: "catalog", coverageComplete: false });
  });

  it("clamps scores to the question maximum and never permits a negative result", () => {
    expect(clampScore(11.9, 8)).toBe(8);
    expect(clampScore(-4, 8)).toBe(0);
  });

  it("opens deviations at exactly three marks, not below", () => {
    expect(requiresDeviation(8, 5)).toBe(true);
    expect(requiresDeviation(8, 6)).toBe(false);
  });

  it("normalizes a JSON-object model response and clamps its awarded mark", () => {
    const result = normalizeGradePayload(
      {
        grades: [
          {
            questionId: "Q1",
            marks: 12,
            feedback: "Strong response",
            confidence: 91,
          },
        ],
        coverageNote: "All pages considered.",
      },
      [{ id: "Q1", label: "Question 1", maximumMarks: 8, keyPoints: [] }]
    );
    expect(result).toEqual({
      grades: [
        {
          questionId: "Q1",
          marks: 8,
          feedback: "Strong response",
          confidence: 91,
        },
      ],
      coverageNote: "All pages considered.",
    });
  });

  it("rejects an AI response that has no scheme-recognized awarded marks", () => {
    expect(() =>
      normalizeGradePayload(
        { grades: [{ questionId: "NOT_IN_SCHEME", marks: 3 }] },
        [{ id: "Q1", label: "Question 1", maximumMarks: 8, keyPoints: [] }]
      )
    ).toThrow("did not contain valid question IDs");
  });

  it("accepts the object-form grade map emitted by the live JSON-object model response", () => {
    const result = normalizeGradePayload(
      { grades: { Q1: 3 }, coverageNote: "Paper read." },
      [{ id: "Q1", label: "Question 1", maximumMarks: 8, keyPoints: [] }]
    );
    expect(result).toEqual({
      grades: [
        {
          questionId: "Q1",
          marks: 3,
          feedback: "AI evaluation returned no written rationale.",
          confidence: 60,
        },
      ],
      coverageNote: "Paper read.",
    });
  });

  it("retains the actionable upstream error detail for the UI", () => {
    expect(
      gradeFailureDetail(
        new Error("LLM invoke failed: 400 unsupported response_format")
      )
    ).toContain("unsupported response_format");
  });

  it("rejects a missing-PDF refusal instead of accepting it as a zero-mark scheme", () => {
    expect(() =>
      validateExtractedSchemePayload({
        questions: [
          {
            id: "PDF not attached",
            label: "Unable to read the paper",
            maximumMarks: 0,
            keyPoints: [],
          },
        ],
      })
    ).toThrow("did not receive the question-paper PDF");
  });

  it("keeps a normal extracted question inventory", () => {
    const questions = [{ id: "Q1", label: "Journal entry", maximumMarks: 3 }];
    expect(validateExtractedSchemePayload({ questions })).toEqual(questions);
  });
});
