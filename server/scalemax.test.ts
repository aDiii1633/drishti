import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CAPABLE_SCALEMAX_MODELS,
  normalizeScaleMaxModel,
} from "./scalemax";

describe("ScaleMax transport", () => {
  it("normalizes the supplied display-style model name into the provider model ID", () => {
    expect(normalizeScaleMaxModel("gpt-5.6 terra")).toBe("gpt-5.6-terra");
  });

  it("restricts PDF grading to verified Opus and Sonnet readers", () => {
    expect(DOCUMENT_CAPABLE_SCALEMAX_MODELS).toEqual([
      "claude-opus-5",
      "claude-sonnet-5",
    ]);
    expect(DOCUMENT_CAPABLE_SCALEMAX_MODELS).not.toContain("gpt-5.4" as never);
  });
});
