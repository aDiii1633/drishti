import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { parse as parseCookieHeader } from "cookie";
import { ROLE_SESSION_COOKIE } from "@shared/const";
import { tokenFromRequest, verifyRoleSession, type RoleSession } from "../roleAuth";
import { getUserById } from "../db";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  roleSession: RoleSession | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (ENV.oAuthServerUrl) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  const roleToken = cookies[ROLE_SESSION_COOKIE] ?? tokenFromRequest(opts.req.headers);
  const verifiedRoleSession = await verifyRoleSession(roleToken);
  let roleSession: RoleSession | null = verifiedRoleSession;
  if (verifiedRoleSession?.userId) {
    const roleUser = await getUserById(verifiedRoleSession.userId);
    if (!roleUser || roleUser.role !== verifiedRoleSession.role || !roleUser.isActive) roleSession = null;
    else roleSession = { ...verifiedRoleSession, mustChangePassword: roleUser.mustChangePassword };
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    roleSession,
  };
}
