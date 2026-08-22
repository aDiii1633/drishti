import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import {
  bundleAssignments,
  bundles,
  documents,
  evaluations,
  evaluatorProfiles,
  examPapers,
  examSessions,
  recheckRequests,
  schools,
  students,
  users,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import { isDemoMode } from "../server/runtimeMode";

if (!isDemoMode()) throw new Error("Run the demo integrity check only with APP_MODE=demo.");
const db = await getDb();
if (!db) throw new Error("Database unavailable.");

const demoSchools = await db.select().from(schools).where(eq(schools.isDemo, true));
const demoUsers = await db.select().from(users).where(eq(users.isDemo, true));
const demoSessions = await db.select().from(examSessions).where(eq(examSessions.isDemo, true));
const demoPapers = await db.select().from(examPapers).where(eq(examPapers.isDemo, true));
const demoStudents = await db.select().from(students).where(eq(students.isDemo, true));
const demoBundles = await db.select().from(bundles).where(eq(bundles.isDemo, true));
const bundleIds = demoBundles.map(bundle => bundle.id);
const assignments = bundleIds.length
  ? await db.select().from(bundleAssignments).where(inArray(bundleAssignments.bundleId, bundleIds))
  : [];
const evaluationRows = bundleIds.length
  ? await db.select().from(evaluations).where(inArray(evaluations.bundleId, bundleIds))
  : [];
const documentRows = bundleIds.length
  ? await db.select().from(documents).where(inArray(documents.bundleId, bundleIds))
  : [];
const recheckRows = bundleIds.length
  ? await db.select().from(recheckRequests).where(inArray(recheckRequests.bundleId, bundleIds))
  : [];
const profiles = await db.select().from(evaluatorProfiles).where(eq(evaluatorProfiles.isDemo, true));

const schoolIds = new Set(demoSchools.map(school => school.id));
const sessionIds = new Set(demoSessions.map(session => session.id));
const paperIds = new Set(demoPapers.map(paper => paper.id));
const studentIds = new Set(demoStudents.map(student => student.id));
const userIds = new Set(demoUsers.map(user => user.id));
const evaluatorIds = new Set(demoUsers.filter(user => user.role === "evaluator").map(user => user.id));

const failures: string[] = [];
for (const user of demoUsers.filter(user => user.role === "school_admin")) {
  if (!user.schoolId || !schoolIds.has(user.schoolId)) failures.push(`school admin ${user.loginId} is outside the demo school set`);
}
for (const student of demoStudents) {
  if (!schoolIds.has(student.schoolId) || !sessionIds.has(student.examSessionId)) failures.push(`student ${student.id} has an orphan school/session link`);
}
for (const paper of demoPapers) {
  if (!sessionIds.has(paper.examSessionId)) failures.push(`paper ${paper.id} has an orphan session link`);
}
for (const bundle of demoBundles) {
  const hasResolvedStudent = bundle.studentId ? studentIds.has(bundle.studentId) : true;
  if (!hasResolvedStudent || !paperIds.has(bundle.examPaperId ?? ""))
    failures.push(`bundle ${bundle.id} has an orphan student/paper link`);
}
for (const assignment of assignments) {
  if (!bundleIds.includes(assignment.bundleId) || !evaluatorIds.has(assignment.evaluatorUserId)) failures.push(`assignment ${assignment.id} has an orphan link`);
}
for (const evaluation of evaluationRows) {
  if (!bundleIds.includes(evaluation.bundleId)) failures.push(`evaluation ${evaluation.id} has an orphan bundle link`);
}
for (const request of recheckRows) {
  if (!bundleIds.includes(request.bundleId)) failures.push(`re-check request ${request.id} has an orphan bundle link`);
}

const assignmentKeys = assignments.map(assignment => `${assignment.bundleId}:${assignment.evaluatorUserId}`);
if (new Set(assignmentKeys).size !== assignmentKeys.length) failures.push("duplicate active bundle/evaluator assignments detected");
if (demoSchools.length < 5) failures.push("expected at least five demo schools");
if (demoStudents.length < 25) failures.push("expected at least twenty-five demo students");
if (demoPapers.length < 5) failures.push("expected at least five demo papers");
if (demoBundles.length < 20) failures.push("expected at least twenty demo answer-sheet bundles");
if (profiles.length < 4 || evaluatorIds.size < 4) failures.push("expected multiple evaluator profiles");
if (assignments.length < 5) failures.push("expected evaluator assignments");
if (evaluationRows.length < 10) failures.push("expected historical evaluation records");
if (documentRows.length < demoBundles.length) failures.push("expected answer-sheet artifacts for every demo bundle");
if (!recheckRows.some(request => request.status === "requested")) failures.push("expected an open student re-check request");

if (failures.length) throw new Error(`Demo integrity failed:\n${failures.join("\n")}`);

console.log(JSON.stringify({
  schools: demoSchools.length,
  schoolAdmins: demoUsers.filter(user => user.role === "school_admin").length,
  students: demoStudents.length,
  sessions: demoSessions.length,
  papers: demoPapers.length,
  qrStates: Object.fromEntries(["active", "revoked", "expired"].map(state => [state, demoPapers.filter(paper => paper.qrStatus === state).length])),
  bundles: demoBundles.length,
  bundleStates: Object.fromEntries([...new Set(demoBundles.map(bundle => bundle.processingState))].map(state => [state, demoBundles.filter(bundle => bundle.processingState === state).length])),
  evaluators: evaluatorIds.size,
  assignments: assignments.length,
  evaluations: evaluationRows.length,
  artifacts: documentRows.length,
  recheckRequests: recheckRows.length,
  activeDemoUsers: demoUsers.filter(user => user.isActive).length,
  orphanLinks: 0,
}));
