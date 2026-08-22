import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { appRouter } from "../server/routers";
import { getDb } from "../server/db";
import { isDemoMode } from "../server/runtimeMode";
import { storageGetBuffer } from "../server/storage";
import {
  answerExtractions,
  bundles,
  evaluations,
  examPapers,
  generations,
  pageChecks,
  teacherAnnotations,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";
import type { DrishtiRole } from "../shared/drishti";

const TEST_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
const TEST_ANSWER_PAGE = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg"><text x="32" y="48">Q1. The answer uses the required method and gives the final result.</text></svg>`,
).toString("base64")}`;
const lifecycleRunId = randomUUID();

if (!isDemoMode()) {
  throw new Error("Run the lifecycle check only with APP_MODE=demo.");
}

const db = await getDb();
if (!db) throw new Error("Database unavailable.");

function context(role: DrishtiRole, userId: number, displayName: string): TrpcContext {
  return {
    user: null,
    roleSession: {
      role,
      userId,
      displayName,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    },
    req: { headers: {} } as TrpcContext["req"],
    res: { cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const accounts = new Map(
  (await db.select().from(users)).map(user => [user.loginId, user]),
);
const admin = accounts.get("admin.demo@example.com");
const scanner = accounts.get("scanner.demo@example.com");
const evaluator = accounts.get("evaluator.demo@example.com");
const schoolAdmin = accounts.get("school.demo@example.com");
if (!admin || !scanner || !evaluator || !schoolAdmin) throw new Error("Demo accounts are not seeded.");
if (scanner.loginMethod !== "local-password" || !scanner.email || !scanner.passwordHash)
  throw new Error("Demo scanner is not seeded as a local-password profile.");
if (!schoolAdmin.schoolId) throw new Error("Demo School Admin is not assigned to a school.");

const loginCaller = appRouter.createCaller({
  user: null,
  roleSession: null,
  req: { headers: {} } as TrpcContext["req"],
  res: { cookie: () => undefined } as unknown as TrpcContext["res"],
});
const demoPassword = process.env.DRISHTI_DEMO_PASSWORD?.trim();
if (!demoPassword) {
  throw new Error("DRISHTI_DEMO_PASSWORD is required for the demo lifecycle test.");
}
const loginResult = await loginCaller.session.login({
  role: "operator",
  loginId: scanner.email,
  password: demoPassword,
});
if (loginResult.session.role !== "operator" || loginResult.session.loginId !== scanner.email)
  throw new Error("The seeded scanner email/password did not create a role session.");

const paper = (
  await db
    .select()
    .from(examPapers)
    .where(eq(examPapers.id, "demo-paper-mathematics-041"))
    .limit(1)
)[0];
if (!paper) throw new Error("Demo paper is not seeded.");

const scannerCaller = appRouter.createCaller(context("operator", scanner.id, scanner.name ?? "Demo scanner"));
const adminCaller = appRouter.createCaller(context("admin", admin.id, admin.name ?? "Demo administrator"));
const evaluatorCaller = appRouter.createCaller(context("evaluator", evaluator.id, evaluator.name ?? "Demo evaluator"));
const schoolAdminCaller = appRouter.createCaller(context("school_admin", schoolAdmin.id, schoolAdmin.name ?? "Demo school administrator"));
const activeDemoPapers = (await db.select().from(examPapers)).filter(
  row => row.isDemo && row.qrStatus === "active",
);
for (const activePaper of activeDemoPapers) {
  const resolved = await scannerCaller.exam.resolveQr({
    payload: `DRISHTI-INTAKE:${activePaper.qrToken}`,
  });
  if (resolved.paper.id !== activePaper.id)
    throw new Error(`Active demo QR resolved to the wrong paper: ${activePaper.id}`);
}
const qrPayload = `DRISHTI-INTAKE:${paper.qrToken}`;
const qr = await scannerCaller.exam.resolveQr({ payload: qrPayload });
if (qr.paper.id !== paper.id) throw new Error("Signed QR resolved to the wrong paper.");
await scannerCaller.exam.resolveQr({ payload: "DRISHTI-INTAKE:not-a-valid-signed-token" }).then(
  () => { throw new Error("Invalid QR was accepted."); },
  () => undefined,
);

const captured = await scannerCaller.bundles.captureImage({
  candidateName: "Aarohi Kapoor",
  candidateId: "DEMO-1001",
  candidateDob: "2008-05-14",
  subject: "Mathematics",
  paperId: paper.id,
  intakeQrToken: paper.qrToken,
  source: "hardware",
  idempotencyKey: lifecycleRunId,
  device: "demo lifecycle file input",
  image: TEST_IMAGE,
  clarity: "CLEAR",
  laplacianVariance: 300,
  reason: "Controlled lifecycle fixture passed the clarity gate.",
});
let storedBundle = (
  await db.select().from(bundles).where(eq(bundles.id, captured.id)).limit(1)
)[0];
if (!storedBundle) throw new Error("Captured bundle could not be loaded for lifecycle verification.");
if (!["submitted", "assigned"].includes(storedBundle.processingState)) {
  await scannerCaller.bundles.submitCapture({ bundleId: captured.id });
  storedBundle = (
    await db.select().from(bundles).where(eq(bundles.id, captured.id)).limit(1)
  )[0];
}
if (!storedBundle) throw new Error("Submitted bundle could not be loaded for lifecycle verification.");
if (storedBundle.processingState !== "assigned") {
  await adminCaller.admin.assignEvaluator({ bundleId: captured.id, evaluatorUserId: evaluator.id });
  storedBundle = (
    await db.select().from(bundles).where(eq(bundles.id, captured.id)).limit(1)
  )[0];
}
if (!storedBundle?.bookletKey || !storedBundle.studentId || storedBundle.processingState !== "assigned")
  throw new Error("Captured bundle did not persist its storage, student, and assignment state.");
await storageGetBuffer(storedBundle.bookletKey);

// Keep this bounded lifecycle fixture repeatable without touching seeded papers.
await db.delete(teacherAnnotations).where(eq(teacherAnnotations.bundleId, captured.id));
await db.delete(answerExtractions).where(eq(answerExtractions.bundleId, captured.id));
await db.delete(generations).where(eq(generations.bundleId, captured.id));
await db.delete(evaluations).where(eq(evaluations.bundleId, captured.id));
await db.update(pageChecks).set({ pageDataUrl: TEST_ANSWER_PAGE }).where(eq(pageChecks.bundleId, captured.id));
const schoolView = await schoolAdminCaller.bundles.get({ id: captured.id });
if (schoolView.bundle.id !== captured.id) throw new Error("School Admin could not access its own school bundle.");
await db.update(bundles).set({ schoolId: "scope-check-other-school" }).where(eq(bundles.id, captured.id));
await schoolAdminCaller.bundles.get({ id: captured.id }).then(
  () => { throw new Error("School Admin accessed a bundle outside its school scope."); },
  error => {
    if (!(error instanceof Error) || !/outside your school administration scope/i.test(error.message)) throw error;
  },
);
await db.update(bundles).set({ schoolId: schoolAdmin.schoolId }).where(eq(bundles.id, captured.id));
const assigned = await evaluatorCaller.evaluator.assignedPapers();
if (!assigned.some(bundle => bundle.id === captured.id))
  throw new Error("Assigned bundle is not visible to the evaluator.");

await evaluatorCaller.marking.open({ bundleId: captured.id });
const opened = await evaluatorCaller.bundles.get({ id: captured.id });
const questions = Array.isArray(opened.scheme?.questions) ? opened.scheme.questions : [];
const question = questions[0];
if (!question) throw new Error("Opening the evaluator workspace did not hydrate an official question.");
const hydrated = opened.evaluations.find(row => row.questionId === question.id);
if (!hydrated) throw new Error("Opening the evaluator workspace did not create the question evaluation record.");

const initialMark = Math.min(question.maximumMarks, 1);
await evaluatorCaller.marking.save({
  id: hydrated.id,
  bundleId: captured.id,
  questionId: question.id,
  questionLabel: question.label,
  schemeMaximum: question.maximumMarks,
  humanMarks: initialMark,
  pagesViewed: [1],
  humanDecision: "override",
  teacherComment: "Controlled lifecycle mark.",
  markAnnotation: { pageNumber: 1, x: 0.38, y: 0.44 },
});
const annotationMark = Math.min(question.maximumMarks, initialMark + 0.5);
await evaluatorCaller.annotations.create({
  bundleId: captured.id,
  questionId: question.id,
  pageNumber: 1,
  type: "mark",
  x: 0.48,
  y: 0.51,
  width: 0.13,
  height: 0.042,
  content: `Teacher awarded: ${annotationMark} / ${question.maximumMarks}`,
  style: {
    marks: annotationMark,
    maximumMarks: question.maximumMarks,
  },
});

let ai: Awaited<ReturnType<typeof evaluatorCaller.marking.aiGradeQuestion>> | null = null;
let aiUnavailable = false;
try {
  ai = await evaluatorCaller.marking.aiGradeQuestion({
    bundleId: captured.id,
    questionId: question.id,
    force: true,
  });
  if (ai.provider !== "openrouter" || !ai.model || ai.grade.suggestedScore === undefined)
    throw new Error("AI did not return a persisted question-level evaluation.");
} catch (error) {
  if (!(error instanceof Error) || !/AI evaluation could not be completed/i.test(error.message)) throw error;
  aiUnavailable = true;
}

const afterAi = await evaluatorCaller.bundles.get({ id: captured.id });
const persisted = afterAi.evaluations.filter(row => row.questionId === question.id);
const evidence = afterAi.extractions.find(row => row.questionId === question.id && row.status === "completed");
const annotationCount = afterAi.annotations.filter(annotation => annotation.questionId === question.id).length;
const teacherMark = afterAi.annotations.find(
  annotation =>
    annotation.questionId === question.id &&
    annotation.type === "mark" &&
    annotation.style &&
    typeof annotation.style === "object" &&
    (annotation.style as { source?: unknown }).source === "teacher",
);
if (
  persisted.length !== 1 ||
  persisted[0].humanMarks !== annotationMark ||
  annotationCount < 1 ||
  !teacherMark ||
  teacherMark.x !== 0.48 ||
  teacherMark.y !== 0.51
)
  throw new Error("Question evaluation, evidence, or annotations were not saved atomically.");
if (!aiUnavailable && persisted[0].aiMarks === null)
  throw new Error("AI did not persist an AI mark after completing the evaluation.");
if (!aiUnavailable && !evidence)
  throw new Error("AI did not persist question evidence after completing the evaluation.");

const adminBeforeFinalization = await adminCaller.dashboard.adminOverview();
await evaluatorCaller.marking.submit({ bundleId: captured.id }).then(
  () => { throw new Error("An incomplete paper was finalized."); },
  error => {
    if (!(error instanceof Error) || !/questions still need a final mark/i.test(error.message)) throw error;
  },
);

const remainingQuestions = questions.filter(item => item.id !== question.id);
let expectedFinalScore = annotationMark;
for (const item of remainingQuestions) {
  const manualMark = Math.min(item.maximumMarks, 1);
  expectedFinalScore += manualMark;
  const itemEvaluation = afterAi.evaluations.find(row => row.questionId === item.id);
  await evaluatorCaller.marking.save({
    id: itemEvaluation?.id,
    bundleId: captured.id,
    questionId: item.id,
    questionLabel: item.label,
    schemeMaximum: item.maximumMarks,
    humanMarks: manualMark,
    pagesViewed: [1],
    humanDecision: "modify",
    teacherComment: "Controlled finalization mark.",
  });
}

const finalization = await evaluatorCaller.marking.submit({ bundleId: captured.id });
if (
  finalization.alreadyFinalized ||
  finalization.nextState !== "completed" ||
  finalization.finalScore !== expectedFinalScore
)
  throw new Error("Evaluator finalization did not return the saved teacher total.");
const repeatedFinalization = await evaluatorCaller.marking.submit({ bundleId: captured.id });
if (!repeatedFinalization.alreadyFinalized)
  throw new Error("A finalized paper was not protected from duplicate completion.");

const expectFinalizationLock = async (operation: Promise<unknown>) => {
  await operation.then(
    () => {
      throw new Error("A finalized paper accepted an evaluation change.");
    },
    error => {
      if (!(error instanceof Error) || !/finalized and can no longer be changed/i.test(error.message)) throw error;
    },
  );
};
await expectFinalizationLock(evaluatorCaller.marking.save({
  id: hydrated.id,
  bundleId: captured.id,
  questionId: question.id,
  questionLabel: question.label,
  schemeMaximum: question.maximumMarks,
  humanMarks: 0,
  pagesViewed: [1],
  humanDecision: "override",
}));
await expectFinalizationLock(evaluatorCaller.annotations.create({
  bundleId: captured.id,
  questionId: question.id,
  pageNumber: 1,
  type: "comment",
  x: 0.2,
  y: 0.2,
  width: 0,
  height: 0,
  content: "This must not be stored after finalization.",
}));
await expectFinalizationLock(evaluatorCaller.marking.aiGradeQuestion({
  bundleId: captured.id,
  questionId: question.id,
  force: true,
}));

const completedBundle = (
  await db.select().from(bundles).where(eq(bundles.id, captured.id)).limit(1)
)[0];
if (
  !completedBundle ||
  completedBundle.status !== "finalized" ||
  completedBundle.processingState !== "completed"
)
  throw new Error("Finalization did not persist the completed evaluated bundle state.");
const [adminAfterFinalization, evaluatedSheets] = await Promise.all([
  adminCaller.dashboard.adminOverview(),
  adminCaller.admin.workspace.answerSheets({ view: "evaluated" }),
]);
const evaluatedRecord = evaluatedSheets.answerSheets.find(
  sheet => sheet.id === captured.id,
);
if (
  !adminBeforeFinalization.metrics ||
  !adminAfterFinalization.metrics ||
  adminAfterFinalization.metrics.evaluated !== adminBeforeFinalization.metrics.evaluated + 1 ||
  adminAfterFinalization.metrics.pendingEvaluation !== adminBeforeFinalization.metrics.pendingEvaluation - 1 ||
  !evaluatedRecord ||
  evaluatedRecord.finalScore !== expectedFinalScore ||
  evaluatedRecord.maximumMarks !== questions.reduce((total, item) => total + item.maximumMarks, 0) ||
  !evaluatedRecord.finalizedAt
)
  throw new Error("Admin evaluated records or derived counters did not update after finalization.");

console.log(JSON.stringify({
  qrResolved: qr.paper.id,
  activeDemoQrsResolved: activeDemoPapers.length,
  capturedBundleId: captured.id,
  assignedEvaluator: evaluator.loginId,
  schoolAdminScope: schoolAdmin.schoolId,
  storagePersisted: true,
  questionHydrated: true,
  manualMarkPersisted: true,
  finalization: {
    processingState: completedBundle.processingState,
    finalScore: finalization.finalScore,
    adminEvaluated: adminAfterFinalization.metrics.evaluated,
  },
  aiEvaluation: ai
    ? { provider: ai.provider, model: ai.model, suggestedScore: ai.grade.suggestedScore }
    : { provider: "unavailable", model: null, suggestedScore: null },
  annotationsPersisted: annotationCount,
}));
