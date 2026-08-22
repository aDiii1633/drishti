import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import {
  answerExtractions,
  auditEvents,
  bundleAssignments,
  bundles,
  clarityCalibrationSamples,
  deviations,
  documents,
  evaluations,
  evaluatorProfiles,
  examPapers,
  examSessions,
  generations,
  markingSchemes,
  pageChecks,
  recheckRequests,
  schools,
  students,
  teacherAnnotations,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { isDemoMode } from "../server/runtimeMode";
import { storageDelete } from "../server/storage";

if (!isDemoMode()) {
  throw new Error("Refusing to reset data outside APP_MODE=demo.");
}

const db = await getDb();
if (!db) throw new Error("Database unavailable.");

const demoUsers = await db
  .select({ id: users.id })
  .from(users)
  .where(eq(users.isDemo, true));
const demoUserIds = demoUsers.map(row => row.id);
const demoSessions = await db
  .select({ id: examSessions.id })
  .from(examSessions)
  .where(eq(examSessions.isDemo, true));
const demoSessionIds = demoSessions.map(row => row.id);
const allPapers = await db.select().from(examPapers);
const demoPapers = allPapers.filter(
  paper => paper.isDemo || demoSessionIds.includes(paper.examSessionId),
);
const demoPaperIds = demoPapers.map(paper => paper.id);
const demoSchemeIds = demoPapers
  .map(paper => paper.schemeId)
  .filter((id): id is string => Boolean(id));
const allBundles = await db.select().from(bundles);
const demoBundles = allBundles.filter(
  bundle => bundle.isDemo || (bundle.createdByUserId !== null && demoUserIds.includes(bundle.createdByUserId)),
);
const bundleIds = demoBundles.map(bundle => bundle.id);
const documentRows = bundleIds.length
  ? await db
      .select({ storageKey: documents.storageKey })
      .from(documents)
      .where(inArray(documents.bundleId, bundleIds))
  : [];

if (bundleIds.length) {
  await db.delete(teacherAnnotations).where(inArray(teacherAnnotations.bundleId, bundleIds));
  await db.delete(answerExtractions).where(inArray(answerExtractions.bundleId, bundleIds));
  await db.delete(evaluations).where(inArray(evaluations.bundleId, bundleIds));
  await db.delete(deviations).where(inArray(deviations.bundleId, bundleIds));
  await db.delete(generations).where(inArray(generations.bundleId, bundleIds));
  await db.delete(pageChecks).where(inArray(pageChecks.bundleId, bundleIds));
  await db.delete(bundleAssignments).where(inArray(bundleAssignments.bundleId, bundleIds));
  await db.delete(recheckRequests).where(inArray(recheckRequests.bundleId, bundleIds));
  await db.delete(auditEvents).where(inArray(auditEvents.bundleId, bundleIds));
  await db.delete(documents).where(inArray(documents.bundleId, bundleIds));
  await db.delete(bundles).where(inArray(bundles.id, bundleIds));
}

await Promise.allSettled(documentRows.map(document => storageDelete(document.storageKey)));
await db.delete(students).where(eq(students.isDemo, true));
if (demoUserIds.length)
  await db.delete(evaluatorProfiles).where(inArray(evaluatorProfiles.userId, demoUserIds));
if (demoPaperIds.length)
  await db.delete(examPapers).where(inArray(examPapers.id, demoPaperIds));
await db.delete(examSessions).where(eq(examSessions.isDemo, true));
const allSchemes = await db.select().from(markingSchemes);
const removableSchemeIds = allSchemes
  .filter(scheme => scheme.isDemo || demoSchemeIds.includes(scheme.id))
  .map(scheme => scheme.id);
if (removableSchemeIds.length)
  await db.delete(markingSchemes).where(inArray(markingSchemes.id, removableSchemeIds));
await db.delete(schools).where(eq(schools.isDemo, true));
if (demoUserIds.length) await db.delete(users).where(inArray(users.id, demoUserIds));
const demoCalibrationRows = await db
  .select({ id: clarityCalibrationSamples.id })
  .from(clarityCalibrationSamples);
const demoCalibrationIds = demoCalibrationRows
  .map(row => row.id)
  .filter(id => id.startsWith("demo-calibration-"));
if (demoCalibrationIds.length)
  await db.delete(clarityCalibrationSamples).where(inArray(clarityCalibrationSamples.id, demoCalibrationIds));

console.log(
  JSON.stringify({
    removedDemoBundles: bundleIds.length,
    removedDemoUsers: demoUserIds.length,
    removedStoredFiles: documentRows.length,
    removedDemoCalibrationSamples: demoCalibrationIds.length,
  }),
);
