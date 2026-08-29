import { afterEach, describe, expect, it, vi } from "vitest";
import { answerPageTextFallback, evaluateAnswer, prepareQuestionEvidence } from "./aiGrading";

const originalApiKey = process.env.GEMINI_API_KEY;
const originalModel = process.env.GEMINI_GRADING_MODEL;

const question = {
  id: "Q4",
  questionNumber: "4",
  label: "Explain the working-capital cycle.",
  questionText: "Explain the working-capital cycle and its effect on a business.",
  maximumMarks: 5,
  keyPoints: ["cash conversion", "inventory", "receivables"],
  requiredConcepts: ["cash conversion", "inventory", "receivables"],
  rubric: [
    { id: "Q4-a", label: "Explains cash conversion", maximumMarks: 2 },
    { id: "Q4-b", label: "Links inventory and receivables", maximumMarks: 2 },
    { id: "Q4-c", label: "States business effect", maximumMarks: 1 },
  ],
} as const;

function response(value: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
  };
}

const validGrade = {
  questionId: "Q4",
  suggestedScore: 3.5,
  maximumScore: 5,
  mappingConfidence: 92,
  gradingConfidence: 91,
  decision: "PARTIAL",
  criteria: [
    { criterionId: "Q4-a", status: "satisfied", score: 2, maximumScore: 2, evidence: "Cash is tied up until sales are collected." },
    { criterionId: "Q4-b", status: "partial", score: 1, maximumScore: 2, evidence: "The answer mentions inventory but not receivables." },
    { criterionId: "Q4-c", status: "partial", score: 0.5, maximumScore: 1, evidence: "It says slower conversion reduces available cash." },
  ],
  detectedConcepts: ["cash conversion", "inventory"],
  missingConcepts: ["receivables"],
  incorrectClaims: [],
  reason: "The core cycle is correct, but the receivables link is incomplete.",
  warnings: [],
  requiresHumanReview: false,
  visualMark: { type: "PARTIAL", displayText: "+3.5 / 5" },
};

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
  if (originalModel === undefined) delete process.env.GEMINI_GRADING_MODEL;
  else process.env.GEMINI_GRADING_MODEL = originalModel;
  vi.restoreAllMocks();
});

function configureGemini() {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_GRADING_MODEL = "gemini-3.6-flash";
}

describe("Gemini question-first grading", () => {
  it("sends the authoritative rubric and selected answer image server-side", async () => {
    configureGemini();
    const fetchMock = vi.fn().mockResolvedValue(response(validGrade));
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateAnswer({
      question,
      answer: "Inventory is converted to cash after sale and collection.",
      extractionConfidence: 91,
      mappingConfidence: 92,
      language: "en-IN",
      pageImageDataUrl: "data:image/png;base64,aGVsbG8=",
    });

    const [url, options] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent");
    expect(options.headers["x-goog-api-key"]).toBe("test-key");
    expect(options.body).toContain("Official rubric");
    expect(options.body).toContain("Do not grade by keyword count");
    expect(options.body).toContain("inlineData");
    expect(options.body).toContain("responseJsonSchema");
    expect(result).toMatchObject({ provider: "gemini", model: "gemini-3.6-flash" });
    expect(result.grade.suggestedScore).toBe(3.5);
  });

  it("retries an invalid score instead of persisting it", async () => {
    configureGemini();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...validGrade, suggestedScore: 6 }))
      .mockResolvedValueOnce(response(validGrade));
    vi.stubGlobal("fetch", fetchMock);

    await expect(evaluateAnswer({
      question,
      answer: "A response.",
      extractionConfidence: 90,
      language: "en-IN",
    })).resolves.toMatchObject({ grade: { suggestedScore: 3.5 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("requires review for unreadable or low-confidence evidence without inventing marks", async () => {
    configureGemini();
    const fetchMock = vi.fn().mockResolvedValue(response({
      ...validGrade,
      mappingConfidence: 50,
      gradingConfidence: 64,
      requiresHumanReview: false,
      warnings: [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateAnswer({
      question,
      answer: "",
      extractionConfidence: 60,
      language: "en-IN",
    });
    expect(result.grade.requiresHumanReview).toBe(true);
    expect(result.grade.warnings.join(" ")).toMatch(/confidence|mapping|readability/i);
  });

  it("maps answer numbering and a normalized visual region from the answer image", async () => {
    configureGemini();
    const fetchMock = vi.fn().mockResolvedValue(response({
      questionId: "Q4",
      answer: "Inventory becomes sales and cash after collection.",
      language: "en-IN",
      confidence: 88,
      pageNumber: 2,
      answerRegion: { x: 0.18, y: 0.42, width: 0.56, height: 0.22 },
      warnings: [],
      requiresHumanReview: false,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const evidence = await prepareQuestionEvidence({
      question,
      language: "en-IN",
      pages: [{ pageNumber: 2, dataUrl: "data:image/png;base64,aGVsbG8=" }],
    });

    expect(evidence).toMatchObject({
      provider: "gemini",
      pageNumber: 2,
      answerRegion: { mapping: "gemini-vision", x: 0.18, requiresHumanReview: false },
    });
  });

  it("uses the stored SVG transcript for local demonstration answer sheets", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="12" y="20">Q4: Inventory becomes cash after collection.</text></svg>`;
    const page = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    expect(answerPageTextFallback(page)).toContain("Inventory becomes cash after collection.");
  });

  it("never creates a demo score when Gemini is not configured", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_GRADING_MODEL;
    await expect(evaluateAnswer({
      question,
      answer: "A response.",
      extractionConfidence: 90,
      language: "en-IN",
    })).rejects.toThrow(/AI evaluation could not be completed/i);
  });
});
