import { createHmac, timingSafeEqual } from "node:crypto";

export const INTAKE_QR_SCHEMA_VERSION = 2;

export type IntakeQrClaims = {
  v: number;
  paperId: string;
  sessionId: string;
  iat: number;
  exp: number | null;
};

function signingSecret() {
  const configured = process.env.QR_SIGNING_SECRET?.trim() || process.env.JWT_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "test") return "test-intake-qr-signing-key";
  throw new Error("QR_SIGNING_SECRET or JWT_SECRET must be configured for intake QR tokens.");
}

function signature(encoded: string) {
  return createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
}

function verifySignature(unsigned: string, supplied: string | undefined) {
  if (!supplied) throw new Error("Malformed intake QR.");
  const expected = Buffer.from(signature(unsigned));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error("Invalid intake QR signature.");
}

function safeIdentifier(value: string) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new Error("QR identifiers must use URL-safe characters.");
  return value;
}

export function issueIntakeQr(input: { paperId: string; sessionId: string; expiresAt?: Date | null }) {
  const paperId = safeIdentifier(input.paperId);
  const sessionId = safeIdentifier(input.sessionId);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = input.expiresAt
    ? Math.floor(input.expiresAt.getTime() / 1000)
    : null;
  const unsigned = [
    String(INTAKE_QR_SCHEMA_VERSION),
    paperId,
    sessionId,
    issuedAt.toString(36),
    expiresAt === null ? "-" : expiresAt.toString(36),
  ].join(":");
  return `${unsigned}.${signature(unsigned)}`;
}

export function verifyIntakeQr(
  payload: string,
  options: { allowExpired?: boolean } = {},
): IntakeQrClaims {
  const token = payload.replace(/^DRISHTI-INTAKE:/i, "").trim();
  if (token.startsWith(`${INTAKE_QR_SCHEMA_VERSION}:`)) {
    const [unsigned, supplied, extra] = token.split(".");
    if (!unsigned || !supplied || extra) throw new Error("Malformed intake QR.");
    verifySignature(unsigned, supplied);
    const [version, paperId, sessionId, issuedAt, expiresAt, extraClaim] =
      unsigned.split(":");
    if (
      version !== String(INTAKE_QR_SCHEMA_VERSION) ||
      extraClaim !== undefined ||
      !paperId ||
      !sessionId ||
      !issuedAt ||
      !expiresAt
    ) {
      throw new Error("Malformed intake QR.");
    }
    safeIdentifier(paperId);
    safeIdentifier(sessionId);
    const iat = Number.parseInt(issuedAt, 36);
    const exp = expiresAt === "-" ? null : Number.parseInt(expiresAt, 36);
    if (!Number.isSafeInteger(iat) || iat <= 0 || (exp !== null && (!Number.isSafeInteger(exp) || exp <= 0)))
      throw new Error("Malformed intake QR.");
    if (!options.allowExpired && exp && exp <= Math.floor(Date.now() / 1000))
      throw new Error("Intake QR has expired.");
    return { v: INTAKE_QR_SCHEMA_VERSION, paperId, sessionId, iat, exp };
  }

  // Version 1 remains readable so already printed bundles do not become invalid.
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) throw new Error("Malformed intake QR.");
  verifySignature(encoded, supplied);
  let claims: IntakeQrClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as IntakeQrClaims;
  } catch {
    throw new Error("Malformed intake QR.");
  }
  if (claims.v !== 1 || !claims.paperId || !claims.sessionId)
    throw new Error("Unsupported intake QR version.");
  if (!options.allowExpired && claims.exp && claims.exp <= Math.floor(Date.now() / 1000))
    throw new Error("Intake QR has expired.");
  return claims;
}
