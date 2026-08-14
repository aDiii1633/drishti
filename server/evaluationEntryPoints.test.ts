import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { issueRoleSession } from "./roleAuth";

const gradeEngineMock = vi.hoisted(() => ({ persistAIGrades: vi.fn() }));
vi.mock("./gradeEngine", async importOriginal => ({ ...(await importOriginal<typeof import("./gradeEngine")>()), persistAIGrades: gradeEngineMock.persistAIGrades }));
vi.mock("./db", () => ({ getDb: vi.fn() }));

import { appRouter } from "./routers";
import { registerDrishtiApi } from "./apiV1";
import { getDb } from "./db";

const mockedGetDb = vi.mocked(getDb);
const persistAIGrades = gradeEngineMock.persistAIGrades;

function evaluatorContext(): TrpcContext {
  return { user: null, roleSession: { role: "evaluator", displayName: "Evaluator desk", issuedAt: 1, expiresAt: 43_201 }, req: { headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

const output = { grades: [{ questionId: "Q1", marks: 4, feedback: "Persisted evaluation", confidence: 90 }], coverageNote: "complete", denominator: { total: 5, source: "paper" as const, coverageComplete: true, note: "printed" }, model: "test-model", generationId: "generation-1" };

describe("AI evaluation entrypoints", () => {
  beforeEach(() => {
    persistAIGrades.mockReset().mockResolvedValue(output);
    mockedGetDb.mockResolvedValue({ update: () => ({ set: () => ({ where: async () => undefined }) }) } as any);
  });

  it("routes authorized evaluator primary and second-reader actions through the marking.aiGrade entrypoint", async () => {
    const caller = appRouter.createCaller(evaluatorContext());
    await expect(caller.marking.aiGrade({ bundleId: "bundle-ai", secondReader: false })).resolves.toEqual(output);
    await expect(caller.marking.aiGrade({ bundleId: "bundle-ai", secondReader: true })).resolves.toEqual(output);
    expect(persistAIGrades).toHaveBeenNthCalledWith(1, { bundleId: "bundle-ai", mode: "primary" });
    expect(persistAIGrades).toHaveBeenNthCalledWith(2, { bundleId: "bundle-ai", mode: "second-reader" });
  });

  it("serves the authorized REST second-reader endpoint and returns its persisted-reader output", async () => {
    const handlers: Record<string, Function> = {};
    registerDrishtiApi({ get: vi.fn(), post: vi.fn((path: string, handler: Function) => { handlers[path] = handler; }) } as any);
    const { token } = await issueRoleSession("evaluator");
    const response: { code?: number; body?: unknown } = {};
    const res = { status: (code: number) => { response.code = code; return res; }, json: (body: unknown) => { response.body = body; return res; } };
    await handlers["/api/v1/ai-read"]({ headers: { authorization: `Bearer ${token}` }, body: { bundleId: "bundle-ai" } }, res);
    expect(persistAIGrades).toHaveBeenCalledWith({ bundleId: "bundle-ai", mode: "second-reader" });
    expect(response).toMatchObject({ body: { reader: "second", grades: output.grades } });
  });
});
