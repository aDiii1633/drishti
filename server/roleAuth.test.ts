import { describe, expect, it } from "vitest";
import { issueAuthenticatedRoleSession, issueRoleSession, verifyRoleSession } from "./roleAuth";

describe("Drishti role sessions", () => {
  it("issues a selected-role JWT with an exact twelve-hour lifetime", async () => {
    const { token, session } = await issueRoleSession("school_admin");
    expect(session.expiresAt - session.issuedAt).toBe(12 * 60 * 60);
    await expect(verifyRoleSession(token)).resolves.toMatchObject({ role: "school_admin", expiresAt: session.expiresAt });
  });

  it("rejects a malformed role-session token", async () => {
    await expect(verifyRoleSession("not-a-jwt")).resolves.toBeNull();
  });

  it("binds an authenticated session to the database user identity", async () => {
    const { token } = await issueAuthenticatedRoleSession({ id: 42, role: "evaluator", name: "Marker", email: null, loginId: "marker-42" });
    await expect(verifyRoleSession(token)).resolves.toMatchObject({ userId: 42, loginId: "marker-42", role: "evaluator", authMethod: "password" });
  });

  it("marks local-password role sessions as password authenticated", async () => {
    const { token } = await issueAuthenticatedRoleSession({ id: 7, role: "operator", name: "Scanner", email: "scanner@example.com", loginId: "scanner@example.com" });
    await expect(verifyRoleSession(token)).resolves.toMatchObject({ userId: 7, role: "operator", authMethod: "password" });
  });
});
