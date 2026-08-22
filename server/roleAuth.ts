import { jwtVerify, SignJWT } from "jose";
import type { User } from "../drizzle/schema";
import { DRISHTI_ROLES, type DrishtiRole } from "../shared/drishti";

function signingSecret() {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV === "test") {
    return new TextEncoder().encode("test-session-signing-key-not-for-production");
  }
  throw new Error("JWT_SECRET must be configured before role sessions can be issued.");
}

export type RoleSession = {
  userId?: number;
  loginId?: string;
  authMethod?: "password";
  role: DrishtiRole;
  displayName: string;
  mustChangePassword?: boolean;
  issuedAt: number;
  expiresAt: number;
};

function isRole(value: unknown): value is DrishtiRole {
  return typeof value === "string" && DRISHTI_ROLES.includes(value as DrishtiRole);
}

function roleDisplayName(role: DrishtiRole) {
  if (role === "operator") return "Scanner desk";
  if (role === "school_admin") return "School administration";
  if (role === "student") return "Student portal";
  return `${role.charAt(0).toUpperCase()}${role.slice(1)} desk`;
}

export async function issueAuthenticatedRoleSession(
  user: Pick<User, "id" | "role" | "name" | "email" | "loginId" | "mustChangePassword">,
  authMethod: "password" = "password",
  rememberMe = false,
): Promise<{ token: string; session: RoleSession }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + (rememberMe ? 30 * 24 * 60 * 60 : 12 * 60 * 60);
  const role = user.role as DrishtiRole;
  const displayName = user.name?.trim() || roleDisplayName(role);
  const token = await new SignJWT({ userId: user.id, loginId: user.loginId ?? user.email ?? undefined, authMethod, role, displayName, mustChangePassword: user.mustChangePassword })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setSubject(`drishti:${role}:${issuedAt}`)
    .sign(signingSecret());
  return { token, session: { userId: user.id, loginId: user.loginId ?? user.email ?? undefined, authMethod, role, displayName, mustChangePassword: user.mustChangePassword, issuedAt, expiresAt } };
}

// Kept for unit-level compatibility with the original role-session tests. HTTP
// login never calls this overload; it always uses an authenticated database user.
export async function issueRoleSession(role: DrishtiRole): Promise<{ token: string; session: RoleSession }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 12 * 60 * 60;
  const displayName = roleDisplayName(role);
  const token = await new SignJWT({ role, displayName })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setSubject(`drishti:test:${role}:${issuedAt}`)
    .sign(signingSecret());
  return { token, session: { role, displayName, issuedAt, expiresAt } };
}

export async function verifyRoleSession(token?: string): Promise<RoleSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, signingSecret(), { algorithms: ["HS256"] });
    if (!isRole(payload.role) || typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    return {
      userId: typeof payload.userId === "number" ? payload.userId : undefined,
      loginId: typeof payload.loginId === "string" ? payload.loginId : undefined,
      authMethod: payload.authMethod === "password" ? "password" : undefined,
      role: payload.role,
      displayName: typeof payload.displayName === "string" ? payload.displayName : payload.role,
      mustChangePassword: payload.mustChangePassword === true,
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
