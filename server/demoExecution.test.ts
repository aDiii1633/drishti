import { afterEach, describe, expect, it } from "vitest";
import { evaluateAnswer } from "./aiGrading";
import { issueRoleSession, verifyRoleSession } from "./roleAuth";

const originalAppMode = process.env.APP_MODE;
const originalGeminiKey = process.env.GEMINI_API_KEY;
const originalGeminiModel = process.env.GEMINI_GRADING_MODEL;

afterEach(() => {
  process.env.APP_MODE = originalAppMode;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  if (originalGeminiModel === undefined) delete process.env.GEMINI_GRADING_MODEL;
  else process.env.GEMINI_GRADING_MODEL = originalGeminiModel;
});

describe("real execution on demo data", () => {
  it("does not replace a missing Gemini configuration with a demo grade", async () => {
    process.env.APP_MODE = "demo";
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_GRADING_MODEL;

    await expect(
      evaluateAnswer({
        question: {
          id: "Q1",
          label: "Differentiate x squared.",
          maximumMarks: 2,
          keyPoints: ["power rule"],
        },
        answer: "The derivative is two x.",
        extractionConfidence: 90,
        language: "en-IN",
      }),
    ).rejects.toThrow(/AI evaluation could not be completed/i);
  });

  it("issues a standard signed role session for a student", async () => {
    const { token } = await issueRoleSession("student");
    await expect(verifyRoleSession(token)).resolves.toMatchObject({
      role: "student",
      displayName: "Student portal",
    });
  });
});
