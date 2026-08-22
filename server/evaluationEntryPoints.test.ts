import { describe, expect, it, vi } from "vitest";
import { registerDrishtiApi } from "./apiV1";

describe("AI evaluation entrypoints", () => {
  it("does not expose the retired bulk reader", () => {
    const handlers: Record<string, Function> = {};
    registerDrishtiApi({
      get: vi.fn(),
      post: vi.fn((path: string, handler: Function) => { handlers[path] = handler; }),
    } as any);

    expect(handlers).not.toHaveProperty("/api/v1/ai-read");
  });
});
