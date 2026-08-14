import { describe, expect, it } from "vitest";
import { CBSE_CLASS_XII_CORE_SUBJECTS } from "./cbse";
import { questionMarksTotal, withinPaperMaximum } from "./teacherSetup";

describe("teacher question setup", () => {
  it("totals question maxima and blocks allocations above the paper maximum", () => {
    const questions = [{ maximumMarks: 5 }, { maximumMarks: 3 }, { maximumMarks: 2 }];
    expect(questionMarksTotal(questions)).toBe(10);
    expect(withinPaperMaximum(questions, 10)).toBe(true);
    expect(withinPaperMaximum(questions, 9)).toBe(false);
  });

  it("provides official curriculum, SQP, and marking references for core Class XII subjects", () => {
    expect(CBSE_CLASS_XII_CORE_SUBJECTS.length).toBeGreaterThanOrEqual(10);
    expect(CBSE_CLASS_XII_CORE_SUBJECTS.every(item => item.curriculum.includes("cbseacademic.nic.in") && item.sqp.includes("cbseacademic.nic.in") && item.marking.includes("cbseacademic.nic.in"))).toBe(true);
  });
});
