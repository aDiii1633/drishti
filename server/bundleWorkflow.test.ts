import { describe, expect, it } from "vitest";
import type { Bundle } from "../drizzle/schema";
import {
  canAssignEvaluator,
  hasCompletedEvaluation,
  hasStoredScan,
} from "./bundleWorkflow";

const bundle = (
  processingState: Bundle["processingState"],
  status: Bundle["status"] = "intake",
) => ({
  processingState,
  status,
});

describe("answer-sheet workflow state", () => {
  it("does not count an unpersisted capture as a scan", () => {
    expect(hasStoredScan(bundle("captured"))).toBe(false);
    expect(hasStoredScan(bundle("saved"))).toBe(true);
  });

  it("only allows evaluation assignment after scanner submission", () => {
    expect(canAssignEvaluator(bundle("saved"))).toBe(false);
    expect(canAssignEvaluator(bundle("ready_for_evaluation"))).toBe(true);
    expect(canAssignEvaluator(bundle("assigned"))).toBe(true);
  });

  it("recognizes submitted and finalized result states", () => {
    expect(hasCompletedEvaluation(bundle("submitted", "moderation"))).toBe(true);
    expect(hasCompletedEvaluation(bundle("grading", "finalized"))).toBe(true);
    expect(hasCompletedEvaluation(bundle("grading", "review"))).toBe(false);
  });
});
