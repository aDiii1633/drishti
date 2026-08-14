import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const context = {
  user: null,
  roleSession: null,
  req: { headers: {} },
  res: {},
} as TrpcContext;

describe("system health", () => {
  it("accepts health checks without synthetic input", async () => {
    await expect(
      appRouter.createCaller(context).system.health()
    ).resolves.toEqual({ ok: true });
  });
});
