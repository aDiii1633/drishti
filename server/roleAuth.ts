import { jwtVerify, SignJWT } from "jose";
import { DRISHTI_ROLES, type DrishtiRole } from "../shared/drishti";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "drishti-development-secret");

export type RoleSession = {
  role: DrishtiRole;
  displayName: string;
  issuedAt: number;
  expiresAt: number;
};

function isRole(value: unknown): value is DrishtiRole {
  return typeof value === "string" && DRISHTI_ROLES.includes(value as DrishtiRole);
}

export async function issueRoleSession(role: DrishtiRole): Promise<{ token: string; session: RoleSession }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 12 * 60 * 60;
  const displayName = `${role.charAt(0).toUpperCase()}${role.slice(1)} desk`;
  const token = await new SignJWT({ role, displayName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setSubject(`drishti:${role}:${issuedAt}`)
    .sign(secret);
  return { token, session: { role, displayName, issuedAt, expiresAt } };
}

export async function verifyRoleSession(token?: string): Promise<RoleSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (!isRole(payload.role) || typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    return {
      role: payload.role,
      displayName: typeof payload.displayName === "string" ? payload.displayName : payload.role,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function tokenFromRequest(headers: { authorization?: string | string[] }): string | undefined {
  const value = Array.isArray(headers.authorization) ? headers.authorization[0] : headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : undefined;
}
