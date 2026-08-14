import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { DrishtiRole } from "../shared/drishti";

function context(role: DrishtiRole): TrpcContext {
  return {
    user: null,
    roleSession: { role, displayName: `${role} desk`, issuedAt: 1, expiresAt: 43_201 },
    req: { headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Drishti procedure permissions", () => {
  it("denies the data console to a non-admin role before any database access", async () => {
    const caller = appRouter.createCaller(context("evaluator"));
    await expect(caller.admin.console()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies the moderation queue to an evaluator role", async () => {
    const caller = appRouter.createCaller(context("evaluator"));
    await expect(caller.deviations.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies an evaluator role from resolving a deviation", async () => {
    const caller = appRouter.createCaller(context("evaluator"));
    await expect(caller.deviations.resolve({ id: "deviation-1", status: "upheld", note: "Unauthorized attempt" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies the intake mutation to a moderator role", async () => {
    const caller = appRouter.createCaller(context("moderator"));
    await expect(caller.bundles.create({
      candidateName: "Candidate 1", subject: "Subject", catalogTotal: 80, questionPaper: { name: "paper.pdf", base64: "data:application/pdf;base64,AA==" }, booklet: { name: "booklet.pdf", base64: "data:application/pdf;base64,AA==" }, pages: [{ pageNumber: 1, clarity: "CLEAR", laplacianVariance: 200, reason: "clear" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
