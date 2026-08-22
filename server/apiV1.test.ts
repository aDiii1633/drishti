import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "./db";
import { registerDrishtiApi } from "./apiV1";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./gradeEngine", () => ({ persistAIGrades: vi.fn() }));

const mockedGetDb = vi.mocked(getDb);

function registeredHandlers() {
  const handlers: Record<string, Function> = {};
  registerDrishtiApi({
    get: vi.fn((path: string, handler: Function) => {
      handlers[`GET ${path}`] = handler;
    }),
    post: vi.fn((path: string, handler: Function) => {
      handlers[`POST ${path}`] = handler;
    }),
  } as any);
  return handlers;
}

function responseRecorder() {
  const response: {
    code: number;
    body?: any;
    headers: Record<string, string>;
  } = { code: 200, headers: {} };
  const res = {
    status: (code: number) => {
      response.code = code;
      return res;
    },
    json: (body: unknown) => {
      response.body = body;
      return res;
    },
    set: (name: string, value: string) => {
      response.headers[name] = value;
      return res;
    },
  };
  return { res, response };
}

describe("Drishti REST API contracts", () => {
  beforeEach(() => mockedGetDb.mockReset());

  it("provides a conventional no-input health endpoint", async () => {
    mockedGetDb.mockResolvedValue({} as any);
    const { res, response } = responseRecorder();
    await registeredHandlers()["GET /api/v1/health"]({}, res);
    expect(response).toMatchObject({
      code: 200,
      body: { ok: true, database: "ready" },
    });
  });

  it("reports OpenRouter grading readiness without exposing the server key", async () => {
    const previousKey = process.env.OPENROUTER_API_KEY;
    const previousModel = process.env.OPENROUTER_MODEL;
    process.env.OPENROUTER_API_KEY = "server-only-test-key";
    process.env.OPENROUTER_MODEL = "qwen/qwen2.5-vl-72b-instruct:free";
    try {
      const { res, response } = responseRecorder();
      await registeredHandlers()["GET /api/v1/ai/status"]({}, res);
      expect(response).toMatchObject({
        code: 200,
        body: {
          provider: "openrouter",
          model: "qwen/qwen2.5-vl-72b-instruct:free",
          ready: true,
        },
      });
      expect(JSON.stringify(response.body)).not.toContain("server-only-test-key");
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
      else process.env.OPENROUTER_MODEL = previousModel;
    }
  });

  it("returns stable JSON for invalid and temporarily unavailable verification requests", async () => {
    const handlers = registeredHandlers();
    const invalid = responseRecorder();
    await handlers["GET /api/v1/qr/verify/:token"](
      { params: { token: "bad token" } },
      invalid.res
    );
    expect(invalid.response).toMatchObject({
      code: 400,
      body: { verified: false },
    });

    mockedGetDb.mockResolvedValue({
      select: () => {
        throw new Error("offline");
      },
    } as any);
    const unavailable = responseRecorder();
    await handlers["GET /api/v1/qr/verify/:token"](
      { params: { token: "valid-token-12345" } },
      unavailable.res
    );
    expect(unavailable.response).toMatchObject({
      code: 503,
      body: {
        verified: false,
        message: "Verification is temporarily unavailable.",
      },
    });
  });

  it("verifies only finalized bundle records", async () => {
    const row = {
      id: "bundle-1",
      subject: "Accountancy",
      status: "finalized",
      updatedAt: new Date("2026-08-14T12:00:00Z"),
    };
    mockedGetDb.mockResolvedValue({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [row] }) }),
      }),
    } as any);
    const { res, response } = responseRecorder();
    await registeredHandlers()["GET /api/v1/qr/verify/:token"](
      { params: { token: "valid-token-12345" } },
      res
    );
    expect(response).toMatchObject({
      code: 200,
      body: { verified: true, bundleId: "bundle-1", status: "finalized" },
    });
  });
});
