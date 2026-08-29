import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAiProvider, structuredJson } from "./aiGrading";
import { suprsonicExtract } from "./suprsonic";

const originalKey = process.env.SUPRSONIC_API_KEY;
const originalProvider = process.env.AI_PROVIDER;

const SCHEMA = {
  type: "object",
  required: ["obtainedMarks"],
  properties: { obtainedMarks: { type: "number" } },
};

function envelope(extracted: unknown, creditsUsed = 3) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: { extracted, source_url: null, content_length: 42, truncated: false },
      error: null,
      metadata: { request_id: "req_test" },
      credits_used: creditsUsed,
    }),
  };
}

function failure(status: number, isRetriable: boolean) {
  return {
    ok: false,
    status,
    json: async () => ({
      success: false,
      error: {
        type: "https://api.o-mega.ai/errors/test",
        title: "Test failure",
        status,
        detail: "internal provider detail that must not leak",
        is_retriable: isRetriable,
        error_category: isRetriable ? "transient" : "authentication",
      },
      credits_used: 0,
    }),
  };
}

beforeEach(() => {
  process.env.SUPRSONIC_API_KEY = "omk_test_key";
  process.env.AI_PROVIDER = "suprsonic";
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.SUPRSONIC_API_KEY;
  else process.env.SUPRSONIC_API_KEY = originalKey;
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  vi.restoreAllMocks();
});

describe("Suprsonic structured extraction", () => {
  it("is the default AI provider", () => {
    delete process.env.AI_PROVIDER;
    expect(getAiProvider()).toBe("suprsonic");
    process.env.AI_PROVIDER = "gemini";
    expect(getAiProvider()).toBe("gemini");
  });

  it("posts the documented contract and returns the extracted object", async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ obtainedMarks: 4 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await suprsonicExtract({
      content: "Student answer: f'(x) = 6x - 4.",
      instruction: "Grade the answer.",
      schema: SCHEMA,
    });

    expect(result.value).toEqual({ obtainedMarks: 4 });
    expect(result.creditsUsed).toBe(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://suprsonic.ai/v1/documents/extract");
    expect(init.headers.Authorization).toBe("Bearer omk_test_key");
    // The schema must go over the wire as an object, not a JSON string.
    expect(JSON.parse(init.body)).toMatchObject({
      content: "Student answer: f'(x) = 6x - 4.",
      extraction_prompt: "Grade the answer.",
      schema: SCHEMA,
    });
  });

  it("retries a retriable failure and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(429, true))
      .mockResolvedValueOnce(envelope({ obtainedMarks: 2 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      suprsonicExtract({ content: "answer", instruction: "grade", schema: SCHEMA })
    ).resolves.toMatchObject({ value: { obtainedMarks: 2 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not leak provider detail on a permanent failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(401, false)));

    await expect(
      suprsonicExtract({ content: "answer", instruction: "grade", schema: SCHEMA })
    ).rejects.toThrow(/AI evaluation could not be completed/i);
    await expect(
      suprsonicExtract({ content: "answer", instruction: "grade", schema: SCHEMA })
    ).rejects.not.toThrow(/internal provider detail/i);
  });

  it("survives a malformed non-JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token 'A'");
        },
      })
    );

    await expect(
      suprsonicExtract({ content: "answer", instruction: "grade", schema: SCHEMA })
    ).rejects.toThrow(/AI evaluation could not be completed/i);
  });

  it("refuses to run without a configured key", async () => {
    delete process.env.SUPRSONIC_API_KEY;
    await expect(
      suprsonicExtract({ content: "answer", instruction: "grade", schema: SCHEMA })
    ).rejects.toThrow(/SUPRSONIC_API_KEY/i);
  });

  it("routes structuredJson text content through Suprsonic", async () => {
    const fetchMock = vi.fn().mockResolvedValue(envelope({ obtainedMarks: 5 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await structuredJson({
      schemaName: "question_grade",
      schema: SCHEMA,
      system: "You are a grader.",
      userContent: [{ type: "text", text: "Question and answer text." }],
      maxOutputTokens: 1000,
    });

    expect(result.value).toEqual({ obtainedMarks: 5 });
    expect(result.model).toBe("suprsonic/documents-extract");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).content).toContain(
      "Question and answer text."
    );
  });

  it("reports plainly that Suprsonic cannot read image-only evidence", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      structuredJson({
        schemaName: "answer_evidence",
        schema: SCHEMA,
        system: "Locate the answer.",
        userContent: [
          { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        ],
        maxOutputTokens: 1000,
      })
    ).rejects.toThrow(/cannot read answer-sheet images/i);
    // No credits are spent on a request that could never work.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
