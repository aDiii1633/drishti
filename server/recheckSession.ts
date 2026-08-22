import { desc, eq } from "drizzle-orm";
import { examSessions } from "../drizzle/schema";
import { getDb } from "./db";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type RecheckSessionRow = Pick<
  typeof examSessions.$inferSelect,
  | "id"
  | "name"
  | "code"
  | "status"
  | "recheckStatus"
  | "recheckOpenUntil"
  | "updatedAt"
>;

export function chooseCurrentRecheckSession(
  rows: RecheckSessionRow[],
): RecheckSessionRow | null {
  const ordered = [...rows].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
  return (
    ordered.find(row => isRecheckSessionOpen(row)) ??
    ordered.find(row => row.status !== "closed") ??
    ordered[0] ??
    null
  );
}

export function isRecheckSessionOpen(
  session: RecheckSessionRow | null,
  now = new Date(),
) {
  return Boolean(
    session?.recheckStatus === "open" &&
      (!session.recheckOpenUntil || session.recheckOpenUntil.getTime() > now.getTime()),
  );
}

export async function getCurrentRecheckSession(db: Database) {
  const rows = await db
    .select({
      id: examSessions.id,
      name: examSessions.name,
      code: examSessions.code,
      status: examSessions.status,
      recheckStatus: examSessions.recheckStatus,
      recheckOpenUntil: examSessions.recheckOpenUntil,
      updatedAt: examSessions.updatedAt,
    })
    .from(examSessions)
    .orderBy(desc(examSessions.updatedAt));
  const session = chooseCurrentRecheckSession(rows);
  return { open: isRecheckSessionOpen(session), session };
}

export async function getRecheckSession(
  db: Database,
  sessionId: string,
) {
  const session = (
    await db
      .select({
        id: examSessions.id,
        name: examSessions.name,
        code: examSessions.code,
        status: examSessions.status,
        recheckStatus: examSessions.recheckStatus,
        recheckOpenUntil: examSessions.recheckOpenUntil,
        updatedAt: examSessions.updatedAt,
      })
      .from(examSessions)
      .where(eq(examSessions.id, sessionId))
      .limit(1)
  )[0] ?? null;
  return { open: isRecheckSessionOpen(session), session };
}
