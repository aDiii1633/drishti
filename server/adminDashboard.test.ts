import { describe, expect, it } from "vitest";
import { calculateAdminMetrics } from "./adminDashboard";

describe("admin operational metrics", () => {
  it("derives scanned, evaluated, and pending counts from bundle workflow states", () => {
    const metrics = calculateAdminMetrics(
      [
        { processingState: "captured", status: "intake" },
        { processingState: "ready_for_evaluation", status: "review" },
        { processingState: "assigned", status: "grading" },
        { processingState: "submitted", status: "moderation" },
        { processingState: "completed", status: "finalized" },
      ],
      3,
      1,
    );

    expect(metrics).toEqual({
      schools: 1,
      evaluators: 3,
      totalAnswerSheets: 5,
      scanned: 4,
      evaluated: 2,
      pendingEvaluation: 2,
    });
  });
});
