import { describe, expect, it } from "vitest";
import {
  chooseCurrentRecheckSession,
  isRecheckSessionOpen,
  type RecheckSessionRow,
} from "./recheckSession";

function session(
  overrides: Partial<RecheckSessionRow> = {},
): RecheckSessionRow {
  return {
    id: "session-1",
    name: "Board examination",
    code: "BOARD-01",
    status: "open",
    recheckStatus: "closed",
    recheckOpenUntil: null,
    updatedAt: new Date("2026-08-17T10:00:00Z"),
    ...overrides,
  };
}

describe("re-check session control", () => {
  it("keeps re-checking closed by default", () => {
    expect(isRecheckSessionOpen(session())).toBe(false);
  });

  it("opens only when the current session is explicitly open", () => {
    expect(
      isRecheckSessionOpen(
        session({ recheckStatus: "open" }),
        new Date("2026-08-17T10:00:00Z"),
      ),
    ).toBe(true);
  });

  it("closes an expired re-check window", () => {
    expect(
      isRecheckSessionOpen(
        session({
          recheckStatus: "open",
          recheckOpenUntil: new Date("2026-08-17T09:59:00Z"),
        }),
        new Date("2026-08-17T10:00:00Z"),
      ),
    ).toBe(false);
  });

  it("prefers an explicitly open re-check window over a newer closed session", () => {
    const current = session({
      id: "current",
      updatedAt: new Date("2026-08-17T11:00:00Z"),
      recheckStatus: "closed",
    });
    const olderOpen = session({
      id: "older",
      updatedAt: new Date("2026-08-17T09:00:00Z"),
      recheckStatus: "open",
    });
    expect(chooseCurrentRecheckSession([olderOpen, current])?.id).toBe(
      "older",
    );
    expect(
      isRecheckSessionOpen(chooseCurrentRecheckSession([olderOpen, current])),
    ).toBe(true);
  });
});
