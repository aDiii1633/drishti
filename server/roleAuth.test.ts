import { describe, expect, it } from "vitest";
import { issueRoleSession, verifyRoleSession } from "./roleAuth";

describe("Drishti role sessions", () => {
  it("issues a selected-role JWT with an exact twelve-hour lifetime", async () => {
    const { token, session } = await issueRoleSession("moderator");
    expect(session.expiresAt - session.issuedAt).toBe(12 * 60 * 60);
    await expect(verifyRoleSession(token)).resolves.toMatchObject({ role: "moderator", expiresAt: session.expiresAt });
  });

  it("rejects a malformed role-session token", async () => {
    await expect(verifyRoleSession("not-a-jwt")).resolves.toBeNull();
  });
});
