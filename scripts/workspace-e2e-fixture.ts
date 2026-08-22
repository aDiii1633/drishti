import "dotenv/config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  auditEvents,
  bundleAssignments,
  bundles,
  examPapers,
  examSessions,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { hashPassword } from "../server/passwordAuth";

const cleanup = process.argv[2] === "--cleanup";
const marker = process.argv[3];
const db = await getDb();

if (!db) throw new Error("Database unavailable for the workspace fixture.");

if (cleanup) {
  if (!marker) throw new Error("Provide the fixture marker to clean up.");
  const paper = (
    await db
      .select({ id: examPapers.id })
      .from(examPapers)
      .where(eq(examPapers.paperCode, marker))
      .limit(1)
  )[0];
  if (paper) {
    const fixtureBundles = await db
      .select({ id: bundles.id })
      .from(bundles)
      .where(eq(bundles.examPaperId, paper.id));
    for (const bundle of fixtureBundles) {
      await db.delete(bundleAssignments).where(eq(bundleAssignments.bundleId, bundle.id));
      await db.delete(auditEvents).where(eq(auditEvents.bundleId, bundle.id));
      await db.delete(bundles).where(eq(bundles.id, bundle.id));
    }
    await db.delete(examPapers).where(eq(examPapers.id, paper.id));
  }
  await db.delete(examSessions).where(eq(examSessions.code, marker));
  await db.delete(users).where(eq(users.loginId, `${marker.toLowerCase()}-admin@example.com`));
  await db.delete(users).where(eq(users.loginId, `${marker.toLowerCase()}-evaluator@example.com`));
  await db.delete(users).where(eq(users.loginId, `${marker.toLowerCase()}-evaluator-b@example.com`));
  console.log("Workspace fixture cleaned up.");
} else {
  const fixtureMarker = `E2E-${Date.now()}`;
  const sessionId = nanoid(16);
  const paperId = nanoid(16);
  const bundleId = nanoid(16);
  const fixtureEmailPrefix = fixtureMarker.toLowerCase();
  const future = new Date(Date.now() + 60_000);
  const fixturePasswordHash = hashPassword("FixturePassword2026!");

  await db.insert(users).values([
    {
      openId: `fixture:${fixtureMarker}:admin`,
      loginId: `${fixtureEmailPrefix}-admin@example.com`,
      email: `${fixtureEmailPrefix}-admin@example.com`,
      passwordHash: fixturePasswordHash,
      name: "Fixture Center Admin",
      loginMethod: "local-password",
      role: "admin",
    },
    {
      openId: `fixture:${fixtureMarker}:evaluator`,
      loginId: `${fixtureEmailPrefix}-evaluator@example.com`,
      email: `${fixtureEmailPrefix}-evaluator@example.com`,
      passwordHash: fixturePasswordHash,
      name: "Fixture Evaluator",
      loginMethod: "local-password",
      role: "evaluator",
    },
  ]);
  await db.insert(examSessions).values({
    id: sessionId,
    name: "Evaluator workflow fixture",
    code: fixtureMarker,
    centerName: "Fixture Examination Center",
    status: "open",
    createdByUserId: 0,
    updatedAt: future,
  });
  await db.insert(examPapers).values({
    id: paperId,
    examSessionId: sessionId,
    subject: "Fixture Physics",
    subjectCode: "PHY",
    paperCode: fixtureMarker,
    title: "Evaluator workflow fixture paper",
    maximumMarks: 80,
    qrToken: `fixture-${fixtureMarker}`,
    createdByUserId: 0,
  });
  await db.insert(bundles).values({
    id: bundleId,
    candidateName: "Fixture Candidate",
    subject: "Fixture Physics",
    examPaperId: paperId,
    pageCount: 1,
    createdByRole: "operator",
    processingState: "ready_for_evaluation",
  });
  console.log(
    JSON.stringify({
      marker: fixtureMarker,
      adminEmail: `${fixtureEmailPrefix}-admin@example.com`,
      evaluatorEmail: `${fixtureEmailPrefix}-evaluator@example.com`,
      bundleId,
    }),
  );
}
