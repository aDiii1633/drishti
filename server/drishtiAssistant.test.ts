import { describe, expect, it } from "vitest";
import {
  assistantAuthorizationRefusal,
  detectAssistantLanguage,
  isAssistantQuestionInScope,
  OUT_OF_SCOPE,
} from "./drishtiAssistant";

describe("DRISHTI AI Assistant guardrails", () => {
  it("detects English, Hindi, and Hinglish input", () => {
    expect(detectAssistantLanguage("Has my paper been evaluated?")).toBe("en");
    expect(detectAssistantLanguage("मेरा पेपर चेक हुआ है क्या?")).toBe("hi");
    expect(detectAssistantLanguage("Paper finalize kaise karna hai?")).toBe("hinglish");
  });

  it("keeps questions within DRISHTI and examination scope", () => {
    expect(isAssistantQuestionInScope("How do I scan a QR?")).toBe(true);
    expect(isAssistantQuestionInScope("What does this marking rubric mean?")).toBe(true);
    expect(isAssistantQuestionInScope("Show pending evaluations")).toBe(true);
    expect(isAssistantQuestionInScope("मेरा पेपर चेक हुआ है क्या?")).toBe(true);
    expect(isAssistantQuestionInScope("Who won yesterday's match?")).toBe(false);
    expect(OUT_OF_SCOPE).toContain("DRISHTI");
  });

  it("blocks cross-role and cross-student requests before Gemini is called", () => {
    expect(assistantAuthorizationRefusal("student", "Show all students marks")).toContain("own authorized");
    expect(assistantAuthorizationRefusal("school_admin", "Show another school data")).toContain("authorized school");
    expect(assistantAuthorizationRefusal("operator", "Show student marks")).toContain("does not provide");
    expect(assistantAuthorizationRefusal("evaluator", "Show all evaluators")).toContain("assigned marking");
  });
});
