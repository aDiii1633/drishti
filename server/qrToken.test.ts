import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { issueIntakeQr, verifyIntakeQr } from "./qrToken";

const originalSecret = process.env.QR_SIGNING_SECRET;
afterEach(() => { process.env.QR_SIGNING_SECRET = originalSecret; });

describe("signed intake QR", () => {
  it("round-trips signed versioned claims", () => {
    process.env.QR_SIGNING_SECRET = "test-secret-that-is-long-enough-for-hmac";
    const token = issueIntakeQr({ paperId: "paper-1", sessionId: "session-1" });
    expect(verifyIntakeQr(`DRISHTI-INTAKE:${token}`)).toMatchObject({ v: 2, paperId: "paper-1", sessionId: "session-1" });
    expect(`DRISHTI-INTAKE:${token}`.length).toBeLessThan(130);
  });

  it("rejects tampering and expiry", () => {
    process.env.QR_SIGNING_SECRET = "test-secret-that-is-long-enough-for-hmac";
    const token = issueIntakeQr({ paperId: "paper-1", sessionId: "session-1" });
    expect(() => verifyIntakeQr(`${token.slice(0, -1)}x`)).toThrow(/signature/i);
    const expired = issueIntakeQr({ paperId: "paper-1", sessionId: "session-1", expiresAt: new Date(Date.now() - 1000) });
    expect(() => verifyIntakeQr(expired)).toThrow(/expired/i);
    expect(verifyIntakeQr(expired, { allowExpired: true })).toMatchObject({ paperId: "paper-1" });
  });

  it("keeps already-issued version 1 tokens valid", () => {
    const secret = "test-secret-that-is-long-enough-for-hmac";
    process.env.QR_SIGNING_SECRET = secret;
    const claims = {
      v: 1,
      paperId: "legacy-paper",
      sessionId: "legacy-session",
      iat: Math.floor(Date.now() / 1000),
      exp: null,
    };
    const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    expect(verifyIntakeQr(`DRISHTI-INTAKE:${encoded}.${signature}`)).toMatchObject(claims);
  });
});
