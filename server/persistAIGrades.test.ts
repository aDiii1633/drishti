import { beforeEach, describe, expect, it, vi } from "vitest";
import { bundles, deviations, evaluations, markingSchemes } from "../drizzle/schema";
import { getDb } from "./db";
import { persistAIGrades } from "./gradeEngine";

vi.mock("./db", () => ({ getDb: vi.fn() }));
const mockedGetDb = vi.mocked(getDb);

describe("persistAIGrades", () => {
  const storedEvaluations: any[] = [];
  const bundle = { id: "bundle-ai", schemeId: "scheme-ai" };
  const scheme = { id: "scheme-ai", questions: [{ id: "Q1", label: "Question 1", maximumMarks: 5, keyPoints: [] }] };

  beforeEach(() => {
    storedEvaluations.length = 0;
    const result = (rows: any[]) => Object.assign(Promise.resolve(rows), { limit: (count: number) => Promise.resolve(rows.slice(0, count)) });
    const fakeDb = {
      select: () => ({ from: (table: unknown) => ({ where: () => {
        if (table === bundles) return result([bundle]);
        if (table === markingSchemes) return result([scheme]);
        if (table === evaluations) return result(storedEvaluations);
        if (table === deviations) return result([]);
        return result([]);
      } }) }),
      insert: (table: unknown) => ({ values: (row: any) => ({ onConflictDoUpdate: async ({ set }: any) => {
        if (table !== evaluations) return;
        const existing = storedEvaluations.find(item => item.id === row.id);
        if (existing) Object.assign(existing, set); else storedEvaluations.push({ ...row });
      } }) }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    mockedGetDb.mockResolvedValue(fakeDb as any);
  });

  it("persists primary and second-reader grades against the same scheme-clamped evaluation row", async () => {
    const seenModes: string[] = [];
    const runner = async ({ mode }: { bundleId: string; mode: "primary" | "second-reader" }) => {
      seenModes.push(mode);
      return { grades: [{ questionId: "Q1", marks: mode === "primary" ? 3 : 4, feedback: `${mode} feedback`, confidence: 88 }], coverageNote: "complete", denominator: { total: 5, source: "paper" as const, coverageComplete: true, note: "printed" }, model: "test-model", generationId: "generation-1" };
    };

    await persistAIGrades({ bundleId: "bundle-ai", mode: "primary" }, runner);
    await persistAIGrades({ bundleId: "bundle-ai", mode: "second-reader" }, runner);

    expect(seenModes).toEqual(["primary", "second-reader"]);
    expect(storedEvaluations).toHaveLength(1);
    expect(storedEvaluations[0]).toMatchObject({ bundleId: "bundle-ai", questionId: "Q1", schemeMaximum: 5, aiMarks: 4, feedback: "second-reader feedback", confidence: 88 });
  });
});
