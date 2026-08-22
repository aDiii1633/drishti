import "dotenv/config";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  bundles,
  evaluatorProfiles,
  examPapers,
  examSessions,
  schools,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { appRouter } from "../server/routers";

const marker = `admin-metric-test-${Date.now()}`;
const sessionId = nanoid(16);
const paperId = nanoid(16);
const bundleId = nanoid(16);
const schoolId = nanoid(16);
const db = await getDb();
let evaluatorUserId: number | undefined;

if (!db) throw new Error("Database unavailable for the live metric test.");

const caller = appRouter.createCaller({
  req: { headers: {} } as never,
  res: {} as never,
  user: null,
  roleSession: {
    role: "admin",
    userId: 0,
    displayName: "Metric test admin",
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  },
});

function assertMetric(
  actual: number | undefined,
  expected: number,
  label: string,
) {
  if (actual !== expected)
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
}

try {
  const future = new Date(Date.now() + 60_000);
  await db.insert(examSessions).values({
    id: sessionId,
    name: `Live metric test ${marker}`,
    code: marker.toUpperCase(),
    centerName: "Metric Test Center",
    status: "open",
    createdByUserId: 0,
    updatedAt: future,
  });
  const baseline = await caller.dashboard.adminOverview();
  await db.insert(users).values({
    openId: `metric-test:${marker}`,
    loginId: marker,
    name: "Metric Test Evaluator",
    role: "evaluator",
  });
  evaluatorUserId = (
    await db.select().from(users).where(eq(users.loginId, marker)).limit(1)
  )[0]?.id;
  if (!evaluatorUserId) throw new Error("Metric evaluator was not created.");
  await db.insert(evaluatorProfiles).values({
    userId: evaluatorUserId,
    subject: "Metric Test Subject",
    centerName: "Metric Test Center",
  });
  await db.insert(schools).values({
    id: schoolId,
    name: "Metric Test School",
    code: `MTS-${marker}`,
    centerName: "Metric Test Center",
  });
  await db.insert(examPapers).values({
    id: paperId,
    examSessionId: sessionId,
    subject: "Metric Test Subject",
    subjectCode: "MTS",
    paperCode: "METRIC-01",
    title: "Live metric validation paper",
    maximumMarks: 80,
    qrToken: `metric-${marker}`,
    createdByUserId: 0,
  });
  await db.insert(bundles).values({
    id: bundleId,
    candidateName: "Metric Test Candidate",
    schoolId,
    subject: "Metric Test Subject",
    examPaperId: paperId,
    pageCount: 1,
    createdByRole: "operator",
    processingState: "captured",
  });

  const captured = await caller.dashboard.adminOverview();
  assertMetric(captured.metrics?.schools, 1, "schools after insert");
  assertMetric(
    captured.metrics?.evaluators,
    (baseline.metrics?.evaluators ?? 0) + 1,
    "evaluators after insert",
  );
  assertMetric(captured.metrics?.totalAnswerSheets, 1, "total after insert");
  assertMetric(captured.metrics?.scanned, 0, "scanned while captured");

  await db
    .update(bundles)
    .set({ processingState: "saved" })
    .where(eq(bundles.id, bundleId));
  const scanned = await caller.dashboard.adminOverview();
  assertMetric(scanned.metrics?.scanned, 1, "scanned after save");
  assertMetric(scanned.metrics?.pendingEvaluation, 1, "pending after save");

  await db
    .update(bundles)
    .set({ processingState: "submitted", status: "moderation" })
    .where(eq(bundles.id, bundleId));
  const evaluated = await caller.dashboard.adminOverview();
  assertMetric(evaluated.metrics?.evaluated, 1, "evaluated after submission");
  assertMetric(evaluated.metrics?.pendingEvaluation, 0, "pending after submission");

  console.log("Live Admin metric mutation test passed.");
} finally {
  await db.delete(bundles).where(eq(bundles.id, bundleId));
  await db.delete(examPapers).where(eq(examPapers.id, paperId));
  await db.delete(examSessions).where(eq(examSessions.id, sessionId));
  if (evaluatorUserId)
    await db
      .delete(evaluatorProfiles)
      .where(eq(evaluatorProfiles.userId, evaluatorUserId));
  await db.delete(schools).where(eq(schools.id, schoolId));
  await db.delete(users).where(eq(users.loginId, marker));
}
