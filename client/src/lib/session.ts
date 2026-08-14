import type { DrishtiRole } from "@shared/drishti";

export type StoredRoleSession = { role: DrishtiRole; displayName: string; expiresAt: number };
const TOKEN_KEY = "drishti-role-session";
const SESSION_KEY = "drishti-role-profile";

export function readRoleSession(): StoredRoleSession | null {
  try {
    const value = localStorage.getItem(SESSION_KEY);
    if (!value) return null;
    const session = JSON.parse(value) as StoredRoleSession;
    if (!session.expiresAt || session.expiresAt * 1000 <= Date.now()) { clearRoleSession(); return null; }
    return session;
  } catch { return null; }
}

export function writeRoleSession(token: string, session: StoredRoleSession) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearRoleSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY); }
