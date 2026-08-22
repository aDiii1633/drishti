import {
  bundleAssignments,
  bundles,
  evaluatorProfiles,
  evaluations,
  examPapers,
  examSessions,
  schools,
  users,
} from "../drizzle/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { hasCompletedEvaluation, hasStoredScan } from "./bundleWorkflow";

export type AnswerSheetView = "all" | "scanned" | "assigned" | "evaluated" | "pending";

export async function activeAdminScope() {
  const db = await getDb();
  if (!db) throw new Error("The database is unavailable.");
  const sessions = await db
    .select()
    .from(examSessions)
    .orderBy(desc(examSessions.updatedAt));
  const session = sessions.find(item => item.status === "open");
  if (!session) return { db, session: null, paperIds: [], bundleRows: [] };

  const paperRows = await db
    .select({ id: examPapers.id })
    .from(examPapers)
    .where(eq(examPapers.examSessionId, session.id));
  const paperIds = paperRows.map(item => item.id);
  const bundleRows = paperIds.length
    ? await db.select().from(bundles).where(inArray(bundles.examPaperId, paperIds))
    : [];
  return { db, session, paperIds, bundleRows };
}

export async function getAdminWorkspaceMetrics() {
  const scope = await activeAdminScope();
  if (!scope.session) return { currentSession: null, metrics: null, updatedAt: null };
  const [schoolRows, profileRows, assignmentRows] = await Promise.all([
    scope.db
      .select({ id: schools.id })
      .from(schools)
      .where(eq(schools.centerName, scope.session.centerName)),
    scope.db
      .select({ userId: evaluatorProfiles.userId })
      .from(evaluatorProfiles)
      .where(eq(evaluatorProfiles.centerName, scope.session.centerName)),
    scope.bundleRows.length
      ? scope.db
          .select({ bundleId: bundleAssignments.bundleId, evaluatorUserId: bundleAssignments.evaluatorUserId })
          .from(bundleAssignments)
          .where(inArray(bundleAssignments.bundleId, scope.bundleRows.map(bundle => bundle.id)))
      : Promise.resolve([]),
  ]);
  const scannedRows = scope.bundleRows.filter(hasStoredScan);
  const evaluatedRows = scannedRows.filter(hasCompletedEvaluation);
  const latestBundleUpdate = scope.bundleRows.reduce(
    (latest, bundle) =>
      bundle.updatedAt.getTime() > latest.getTime() ? bundle.updatedAt : latest,
    scope.session.updatedAt,
  );
  return {
    currentSession: {
      id: scope.session.id,
      name: scope.session.name,
      code: scope.session.code,
      centerName: scope.session.centerName,
    },
    metrics: {
      schools: schoolRows.length,
      evaluators: new Set([
        ...profileRows.map(row => row.userId),
        ...assignmentRows.map(row => row.evaluatorUserId),
      ]).size,
      totalAnswerSheets: scope.bundleRows.length,
      scanned: scannedRows.length,
      assigned: new Set(assignmentRows.map(row => row.bundleId)).size,
      evaluated: evaluatedRows.length,
      pendingEvaluation: scannedRows.length - evaluatedRows.length,
    },
    updatedAt: latestBundleUpdate,
  };
}

export async function listWorkspaceSchools() {
  const scope = await activeAdminScope();
  if (!scope.session) return { currentSession: null, schools: [] };
  const rows = await scope.db
    .select()
    .from(schools)
    .where(eq(schools.centerName, scope.session.centerName))
    .orderBy(schools.name);
  const result = rows.map(school => {
    const schoolBundles = scope.bundleRows.filter(bundle => bundle.schoolId === school.id);
    const studentCount = new Set(
      schoolBundles.map(bundle => bundle.candidateId).filter(Boolean),
    ).size;
    return {
      ...school,
      studentCount,
      answerSheetCount: schoolBundles.length,
      scannedCount: schoolBundles.filter(hasStoredScan).length,
      evaluatedCount: schoolBundles.filter(hasCompletedEvaluation).length,
    };
  });
  return { currentSession: scope.session, schools: result };
}

export async function getWorkspaceSchool(id: string) {
  const scope = await activeAdminScope();
  if (!scope.session) return null;
  const school = (
    await scope.db.select().from(schools).where(eq(schools.id, id)).limit(1)
  )[0];
  if (!school || school.centerName !== scope.session.centerName) return null;
  const records = scope.bundleRows
    .filter(bundle => bundle.schoolId === school.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map(bundle => ({
      id: bundle.id,
      candidateName: bundle.candidateName,
      candidateId: bundle.candidateId,
      subject: bundle.subject,
      status: bundle.status,
      processingState: bundle.processingState,
      updatedAt: bundle.updatedAt,
    }));
  return {
    school,
    currentSession: scope.session,
    studentCount: new Set(records.map(record => record.candidateId).filter(Boolean)).size,
    answerSheets: records,
  };
}

async function evaluatorRowsForScope() {
  const scope = await activeAdminScope();
  if (!scope.session) return { scope, evaluators: [] };
  const [evaluatorRows, profileRows, assignmentRows] = await Promise.all([
    scope.db.select().from(users).where(eq(users.role, "evaluator")),
    scope.db.select().from(evaluatorProfiles),
    scope.bundleRows.length
      ? scope.db
          .select()
          .from(bundleAssignments)
          .where(inArray(bundleAssignments.bundleId, scope.bundleRows.map(bundle => bundle.id)))
      : Promise.resolve([]),
  ]);
  const profileByUserId = new Map(profileRows.map(profile => [profile.userId, profile]));
  const bundleById = new Map(scope.bundleRows.map(bundle => [bundle.id, bundle]));
  const activeEvaluatorIds = new Set([
    ...profileRows
      .filter(profile => profile.centerName === scope.session.centerName)
      .map(profile => profile.userId),
    ...assignmentRows.map(assignment => assignment.evaluatorUserId),
  ]);
  return {
    scope,
    evaluators: evaluatorRows.filter(user => activeEvaluatorIds.has(user.id)).map(user => {
      const assignments = assignmentRows.filter(
        assignment => assignment.evaluatorUserId === user.id,
      );
      const assignedBundles = assignments
        .map(assignment => bundleById.get(assignment.bundleId))
        .filter((bundle): bundle is NonNullable<typeof bundle> => Boolean(bundle));
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        loginId: user.loginId,
        subject: profileByUserId.get(user.id)?.subject ?? "Not set",
        centerName: profileByUserId.get(user.id)?.centerName ?? scope.session.centerName,
        assignmentCount: assignedBundles.length,
        evaluatedCount: assignedBundles.filter(hasCompletedEvaluation).length,
        pendingCount: assignedBundles.filter(
          bundle =>
            hasStoredScan(bundle) &&
            !hasCompletedEvaluation(bundle),
        ).length,
        lastAssignedAt: assignments.reduce<Date | null>(
          (latest, assignment) =>
            !latest || assignment.assignedAt.getTime() > latest.getTime()
              ? assignment.assignedAt
              : latest,
          null,
        ),
      };
    }),
  };
}

export async function listWorkspaceEvaluators() {
  const { scope, evaluators } = await evaluatorRowsForScope();
  return { currentSession: scope.session, evaluators };
}

export async function getWorkspaceEvaluator(userId: number) {
  const { scope, evaluators } = await evaluatorRowsForScope();
  if (!scope.session) return null;
  const evaluator = evaluators.find(item => item.id === userId);
  if (!evaluator) return null;
  const assignmentRows = await scope.db
    .select()
    .from(bundleAssignments)
    .where(eq(bundleAssignments.evaluatorUserId, userId));
  const assignedBundleIds = new Set(assignmentRows.map(item => item.bundleId));
  const assignments = scope.bundleRows
    .filter(bundle => assignedBundleIds.has(bundle.id))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map(bundle => ({
      id: bundle.id,
      candidateName: bundle.candidateName,
      candidateId: bundle.candidateId,
      subject: bundle.subject,
      processingState: bundle.processingState,
      status: bundle.status,
      updatedAt: bundle.updatedAt,
    }));
  return { currentSession: scope.session, evaluator, assignments };
}

export async function listWorkspaceAnswerSheets(
  view: AnswerSheetView,
  search?: string,
) {
  const scope = await activeAdminScope();
  if (!scope.session) return { currentSession: null, answerSheets: [] };
  const [schoolRows, assignmentRows, evaluatorRows, evaluationRows] = await Promise.all([
    scope.db
      .select()
      .from(schools)
      .where(eq(schools.centerName, scope.session.centerName)),
    scope.bundleRows.length
      ? scope.db
          .select()
          .from(bundleAssignments)
          .where(inArray(bundleAssignments.bundleId, scope.bundleRows.map(bundle => bundle.id)))
      : Promise.resolve([]),
    scope.db.select({ id: users.id, name: users.name }).from(users),
    scope.bundleRows.length
      ? scope.db
          .select()
          .from(evaluations)
          .where(inArray(evaluations.bundleId, scope.bundleRows.map(bundle => bundle.id)))
      : Promise.resolve([]),
  ]);
  const schoolById = new Map(schoolRows.map(school => [school.id, school]));
  const assignmentByBundleId = new Map(
    assignmentRows.map(assignment => [assignment.bundleId, assignment]),
  );
  const userById = new Map(evaluatorRows.map(user => [user.id, user]));
  const evaluationsByBundle = new Map<string, typeof evaluationRows>();
  for (const evaluation of evaluationRows) {
    const rows = evaluationsByBundle.get(evaluation.bundleId) ?? [];
    rows.push(evaluation);
    evaluationsByBundle.set(evaluation.bundleId, rows);
  }
  const normalizedSearch = search?.trim().toLowerCase();
  const selected = scope.bundleRows.filter(bundle => {
    const scanned = hasStoredScan(bundle);
    const evaluated = hasCompletedEvaluation(bundle);
    if (view === "scanned" && !scanned) return false;
    if (view === "assigned" && !assignmentByBundleId.has(bundle.id)) return false;
    if (view === "evaluated" && !evaluated) return false;
    if (view === "pending" && (!scanned || evaluated)) return false;
    if (!normalizedSearch) return true;
    const school = bundle.schoolId ? schoolById.get(bundle.schoolId) : undefined;
    const assignment = assignmentByBundleId.get(bundle.id);
    const evaluator = assignment ? userById.get(assignment.evaluatorUserId) : undefined;
    return [
      bundle.candidateName,
      bundle.candidateId,
      bundle.subject,
      school?.name,
      evaluator?.name,
    ]
      .filter(Boolean)
      .some(value => value!.toLowerCase().includes(normalizedSearch));
  });
  return {
    currentSession: scope.session,
    answerSheets: selected
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, 100)
      .map(bundle => {
        const assignment = assignmentByBundleId.get(bundle.id);
        const finalRows = evaluationsByBundle.get(bundle.id) ?? [];
        const finalScore = finalRows.length
          ? finalRows.reduce((total, row) => total + (row.humanMarks ?? 0), 0)
          : null;
        const maximumMarks = finalRows.length
          ? finalRows.reduce((total, row) => total + row.schemeMaximum, 0)
          : null;
        return {
          id: bundle.id,
          candidateName: bundle.candidateName,
          candidateId: bundle.candidateId,
          subject: bundle.subject,
          school: bundle.schoolId ? schoolById.get(bundle.schoolId)?.name ?? "Unknown school" : "Unlinked",
          evaluator: assignment
            ? userById.get(assignment.evaluatorUserId)?.name ?? "Assigned evaluator"
            : "Unassigned",
          processingState: bundle.processingState,
          status: bundle.status,
          pageCount: bundle.pageCount,
          finalScore,
          maximumMarks,
          finalizedAt:
            bundle.status === "finalized" && bundle.processingState === "completed"
              ? bundle.updatedAt
              : null,
          updatedAt: bundle.updatedAt,
        };
      }),
  };
}
