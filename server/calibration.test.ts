import { describe, expect, it } from "vitest";
import { summarizeCalibration } from "./calibration";

describe("clarity calibration", () => {
  it("reports agreement and the remaining labelled sample count", () => {
    expect(summarizeCalibration([{ expectedClarity: "CLEAR", observedClarity: "CLEAR" }, { expectedClarity: "BLURRY", observedClarity: "CLEAR" }])).toEqual({ total: 2, matches: 1, accuracy: 50, remainingToFifty: 48 });
  });

  it("does not invent an accuracy when no labelled evidence exists", () => {
    expect(summarizeCalibration([])).toEqual({ total: 0, matches: 0, accuracy: null, remainingToFifty: 50 });
  });
});
