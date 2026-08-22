import { COOKIE_NAME, ROLE_SESSION_COOKIE } from "@shared/const";
import {
  answerExtractions,
  teacherAnnotations,
  bundles,
  clarityCalibrationSamples,
  deviations,
  documents,
  evaluatorProfiles,
  evaluations,
  generations,
  markingSchemes,
  pageChecks,
  auditEvents,
  bundleAssignments,
  examPapers,
  examSessions,
  recheckRequests,
  schools,
  students,
  users,
} from "../drizzle/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import { extractSchemeFromPdf, resolveDenominator } from "./gradeEngine";
import { bundleDocumentIntegrity } from "./documentIntegrity";
import {
  finalPdfArtifact,
  replacementPageArtifact,
  sourceArtifactRows,
} from "./documentArtifacts";
import { issueAuthenticatedRoleSession } from "./roleAuth";
import { DRISHTI_ROLES, type SchemeQuestion } from "../shared/drishti";
import {
  getRoleSessionCookieOptions,
  getSessionCookieOptions,
} from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  router,
  roleProcedure,
  withRoles,
} from "./_core/trpc";
import {
  getStoredContentType,
  storageDelete,
  storageGetBuffer,
  storagePut,
} from "./storage";
import { summarizeCalibration } from "./calibration";
import { decodeImageDataUrl, decodePdfUpload } from "./filePayload";
import { getCurrentRecheckSession, getRecheckSession } from "./recheckSession";
import {
  getAdminWorkspaceMetrics,
  getWorkspaceEvaluator,
  getWorkspaceSchool,
  listWorkspaceAnswerSheets,
  listWorkspaceEvaluators,
  listWorkspaceSchools,
} from "./adminWorkspace";
import {
  evaluateAnswer,
  OPENROUTER_EVIDENCE_PROMPT_VERSION,
  OPENROUTER_GRADING_PROMPT_VERSION,
  OPENROUTER_GRADING_MODEL,
  getOpenRouterGradingConfig,
  prepareQuestionEvidence,
} from "./aiGrading";
import {
  issueIntakeQr,
  verifyIntakeQr,
  INTAKE_QR_SCHEMA_VERSION,
} from "./qrToken";
import { canAssignEvaluator } from "./bundleWorkflow";
import {
  hashPassword,
  LOCAL_PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "./passwordAuth";
import {
  QuestionSetValidationError,
  questionSetVersion,
  validateQuestionSet,
} from "./questionSet";
import {
  ASSISTANT_UNAVAILABLE,
  chatWithDrishtiAssistant,
} from "./drishtiAssistant";
import {
  getHardwareScannerProvider,
  simulateHardwareCapture,
  SCANGATE_QUALITY_STATUSES,
  type HardwareCapture,
  type HardwareScannerState,
  type ScanGateQualityStatus,
} from "./hardwareScanner";
import {
  captureUsbPreview,
  captureUsbQr,
  getUsbScannerStatus,
  retryUsbScannerConnection,
  setDevelopmentUsbScannerState,
  USB_SCANNER_STATES,
} from "./scangateUsbAgent";
import {
  decodeQrWithScanGate,
  QrDecoderUnavailableError,
} from "./qrDecoder";

const roleInput = z.enum(DRISHTI_ROLES);
const fileInput = z.object({
  name: z.string().trim().min(1).max(200),
  base64: z.string().min(1).max(34_000_000),
});
const pageInput = z.object({
  pageNumber: z.number().int().positive(),
  clarity: z.enum(["CLEAR", "BLURRY"]),
  laplacianVariance: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500),
  pageDataUrl: z.string().max(14_000_000).optional(),
});
const bundleIdInput = z.string().trim().min(1).max(128);
const halfMarkInput = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    value => Math.abs(value * 2 - Math.round(value * 2)) < 0.0001,
    "Marks must use 0.5-mark increments."
  );
const schemeQuestionInput = z.object({
  id: z.string().trim().min(1).max(120),
  questionNumber: z
    .union([z.string().trim().min(1).max(120), z.number().int().positive()])
    .optional(),
  label: z.string().trim().min(3).max(4_000),
  questionText: z.string().trim().min(3).max(8_000).optional(),
  maximumMarks: z.number().int().positive(),
  keyPoints: z.array(z.string().trim().min(1).max(500)).min(1).max(30),
  order: z.number().int().positive().optional(),
  questionType: z
    .enum(["short_answer", "long_answer", "objective", "practical", "other"])
    .optional(),
  section: z.string().trim().min(1).max(120).optional(),
  keywords: z.array(z.string().trim().min(1).max(240)).max(30).optional(),
  requiredConcepts: z
    .array(z.string().trim().min(1).max(500))
    .min(1)
    .max(30)
    .optional(),
  rubric: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(160),
        label: z.string().trim().min(1).max(1_000),
        maximumMarks: z.number().int().positive(),
      })
    )
    .min(1)
    .max(30)
    .optional(),
});

async function database() {
  const db = await getDb();
  if (!db) throw new Error("The database is unavailable.");
  return db;
}

function requireEditableEvaluationBundle(bundle: {
  status: string;
  processingState: string;
}) {
  if (bundle.status === "finalized" && bundle.processingState === "completed") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This paper is finalized and can no longer be changed.",
    });
  }
}

type StoredAnswerPage = { pageNumber: number; dataUrl: string };

async function storedAnswerPages(
  db: Awaited<ReturnType<typeof database>>,
  bundle: Awaited<ReturnType<typeof requireBundle>>
): Promise<StoredAnswerPage[]> {
  const checks = await db
    .select()
    .from(pageChecks)
    .where(eq(pageChecks.bundleId, bundle.id));
  const capturedPages = checks
    .filter((page): page is typeof page & { pageDataUrl: string } =>
      Boolean(page.pageDataUrl)
    )
    .map(page => ({ pageNumber: page.pageNumber, dataUrl: page.pageDataUrl }))
    .filter(page =>
      /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/i.test(page.dataUrl)
    );
  if (capturedPages.length)
    return capturedPages.sort(
      (left, right) => left.pageNumber - right.pageNumber
    );

  if (!bundle.bookletKey) return [];
  const contentType = await getStoredContentType(bundle.bookletKey);
  if (!contentType || !/^image\/(png|jpe?g|webp|svg\+xml)$/i.test(contentType))
    return [];
  const bytes = await storageGetBuffer(bundle.bookletKey);
  return [
    {
      pageNumber: 1,
      dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
    },
  ];
}

function answerRegionFrom(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const region = value as Partial<{
    x: unknown;
    y: unknown;
    width: unknown;
    height: unknown;
  }>;
  const numbers = [region.x, region.y, region.width, region.height];
  if (
    !numbers.every(
      number => typeof number === "number" && Number.isFinite(number)
    )
  )
    return null;
  const [x, y, width, height] = numbers as number[];
  if (
    x < 0 ||
    y < 0 ||
    width < 0 ||
    height < 0 ||
    x + width > 1 ||
    y + height > 1
  )
    return null;
  return { x, y, width, height };
}

async function audit(
  bundleId: string,
  actorRole: string,
  eventType: string,
  detail: string
) {
  const db = await database();
  await db
    .insert(auditEvents)
    .values({ id: nanoid(16), bundleId, actorRole, eventType, detail });
}

type ScoreAnnotationSource = "ai" | "teacher";

function annotationSource(style: unknown): ScoreAnnotationSource | undefined {
  if (!style || typeof style !== "object" || Array.isArray(style))
    return undefined;
  const source = (style as { source?: unknown }).source;
  return source === "ai" || source === "teacher" ? source : undefined;
}

async function upsertScoreAnnotation(
  db: Awaited<ReturnType<typeof database>>,
  input: {
    bundleId: string;
    questionId: string;
    pageNumber: number;
    marks: number;
    maximumMarks: number;
    source: ScoreAnnotationSource;
    evaluationId: string;
    createdByUserId: number | null;
    createdByRole: string;
    answerRegion?: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    annotationPosition?: { x: number; y: number } | null;
  }
) {
  const existing = (
    await db
      .select()
      .from(teacherAnnotations)
      .where(
        and(
          eq(teacherAnnotations.bundleId, input.bundleId),
          eq(teacherAnnotations.questionId, input.questionId),
          eq(teacherAnnotations.type, "mark")
        )
      )
  ).find(annotation => annotationSource(annotation.style) === input.source);
  const color = input.source === "ai" ? "#2f6f95" : "#28734b";
  const style = {
    color,
    source: input.source,
    marks: input.marks,
    maximumMarks: input.maximumMarks,
    evaluationId: input.evaluationId,
  };
  const anchor = input.annotationPosition
    ? {
        x: Math.min(0.96, Math.max(0.02, input.annotationPosition.x)),
        y: Math.min(0.94, Math.max(0.02, input.annotationPosition.y)),
      }
    : input.answerRegion
      ? {
          x: Math.min(
            0.84,
            Math.max(
              0.02,
              input.answerRegion.x + input.answerRegion.width + 0.018
            )
          ),
          y: Math.min(0.93, Math.max(0.025, input.answerRegion.y)),
        }
      : existing
        ? { x: existing.x, y: existing.y }
        : { x: 0.84, y: 0.075 };
  const content = `${input.source === "ai" ? "AI suggested" : "Teacher awarded"}: +${input.marks} / ${input.maximumMarks}`;
  const values = {
    pageNumber: input.pageNumber,
    x: anchor.x,
    y: anchor.y,
    width: 0.16,
    height: 0.052,
    content,
    style,
  };
  if (existing) {
    await db
      .update(teacherAnnotations)
      .set(values)
      .where(eq(teacherAnnotations.id, existing.id));
    return { annotationId: existing.id, updated: true };
  }
  const id = nanoid(16);
  await db.insert(teacherAnnotations).values({
    id,
    bundleId: input.bundleId,
    questionId: input.questionId,
    type: "mark",
    createdByUserId: input.createdByUserId,
    createdByRole: input.createdByRole,
    ...values,
  });
  return { annotationId: id, updated: false };
}

async function upsertAiDecisionAnnotation(
  db: Awaited<ReturnType<typeof database>>,
  input: {
    bundleId: string;
    questionId: string;
    pageNumber: number;
    marks: number;
    maximumMarks: number;
    evaluationId: string;
    requiresHumanReview: boolean;
    answerRegion: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
  }
) {
  const kind = input.requiresHumanReview
    ? "review"
    : input.marks === input.maximumMarks
      ? "check"
      : input.marks === 0
        ? "cross"
        : "circle";
  const color =
    kind === "check"
      ? "#16805c"
      : kind === "cross"
        ? "#b64c40"
        : kind === "circle"
          ? "#b45309"
          : "#b45309";
  const anchor = input.answerRegion
    ? {
        x: Math.min(
          0.92,
          Math.max(
            0.025,
            input.answerRegion.x + input.answerRegion.width + 0.004
          )
        ),
        y: Math.min(0.92, Math.max(0.025, input.answerRegion.y + 0.01)),
      }
    : { x: 0.78, y: 0.075 };
  const existing = (
    await db
      .select()
      .from(teacherAnnotations)
      .where(
        and(
          eq(teacherAnnotations.bundleId, input.bundleId),
          eq(teacherAnnotations.questionId, input.questionId)
        )
      )
  ).find(annotation => {
    const style = annotation.style;
    return Boolean(
      style &&
        typeof style === "object" &&
        !Array.isArray(style) &&
        (style as { source?: unknown; kind?: unknown }).source === "ai" &&
        (style as { kind?: unknown }).kind === "grade-decision"
    );
  });
  const values = {
    pageNumber: input.pageNumber,
    x: anchor.x,
    y: anchor.y,
    width: kind === "circle" ? 0.038 : 0.04,
    height: kind === "circle" ? 0.038 : 0.04,
    content: `AI: +${input.marks} / ${input.maximumMarks}`,
    style: {
      source: "ai",
      kind: "grade-decision",
      color,
      marks: input.marks,
      maximumMarks: input.maximumMarks,
      evaluationId: input.evaluationId,
    },
  };
  if (existing) {
    await db
      .update(teacherAnnotations)
      .set({ ...values, type: kind })
      .where(eq(teacherAnnotations.id, existing.id));
    return { annotationId: existing.id, updated: true };
  }
  const id = nanoid(16);
  await db.insert(teacherAnnotations).values({
    id,
    bundleId: input.bundleId,
    questionId: input.questionId,
    type: kind,
    createdByUserId: null,
    createdByRole: "system",
    ...values,
  });
  return { annotationId: id, updated: false };
}

async function flagPossibleModelScoreBias(
  db: Awaited<ReturnType<typeof database>>,
  input: {
    bundleId: string;
    questionId: string;
    marks: number;
  }
) {
  const matchingScores = await db
    .select({ bundleId: evaluations.bundleId })
    .from(evaluations)
    .where(
      and(
        eq(evaluations.questionId, input.questionId),
        eq(evaluations.aiProvider, "openrouter"),
        eq(evaluations.aiMarks, input.marks)
      )
    )
    .limit(4);
  const distinctBundles = new Set(matchingScores.map(row => row.bundleId));
  if (distinctBundles.size < 3) return;

  const alreadyFlagged = await db
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.bundleId, input.bundleId),
        eq(auditEvents.eventType, "POSSIBLE_MODEL_OR_PROMPT_BIAS")
      )
    )
    .limit(1);
  if (alreadyFlagged.length) return;

  await audit(
    input.bundleId,
    "system",
    "POSSIBLE_MODEL_OR_PROMPT_BIAS",
    `AI returned ${input.marks} for ${input.questionId} across ${distinctBundles.size} answer sheets. Manual review is required; no score was changed.`
  );
}

async function requireBundle(
  db: Awaited<ReturnType<typeof database>>,
  id: string
) {
  const bundle = (
    await db.select().from(bundles).where(eq(bundles.id, id)).limit(1)
  )[0];
  if (!bundle)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bundle not found." });
  return bundle;
}

async function requireExamPaper(
  db: Awaited<ReturnType<typeof database>>,
  id: string,
  intakeQrToken?: string
) {
  const paper = (
    await db.select().from(examPapers).where(eq(examPapers.id, id)).limit(1)
  )[0];
  if (!paper || paper.status !== "active")
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Exam paper is not active.",
    });
  if (
    paper.qrStatus !== "active" ||
    (paper.qrExpiresAt && paper.qrExpiresAt <= new Date())
  )
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This intake QR is revoked or expired.",
    });
  if (intakeQrToken && paper.qrToken !== intakeQrToken)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The scanned QR does not match this paper.",
    });
  const session = (
    await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, paper.examSessionId))
      .limit(1)
  )[0];
  if (!session || session.status !== "open")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This exam session is not open for scanning.",
    });
  return { paper, session };
}

function sameCenter(left: string | null, right: string | null) {
  return Boolean(
    left &&
      right &&
      left
        .trim()
        .localeCompare(right.trim(), "en", { sensitivity: "accent" }) === 0
  );
}

async function requireSessionCenterAccess(
  db: Awaited<ReturnType<typeof database>>,
  userId: number | undefined,
  session: { centerName: string }
) {
  if (!userId) return;
  const user = (
    await db
      .select({ centerName: users.centerName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];
  if (user?.centerName && !sameCenter(user.centerName, session.centerName)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This staff account is not authorized for the selected exam center.",
    });
  }
}

async function requireBundleSession(
  db: Awaited<ReturnType<typeof database>>,
  bundle: Awaited<ReturnType<typeof requireBundle>>
) {
  if (!bundle.examPaperId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This answer sheet is not linked to a registered exam paper.",
    });
  }
  const paper = (
    await db
      .select()
      .from(examPapers)
      .where(eq(examPapers.id, bundle.examPaperId))
      .limit(1)
  )[0];
  if (!paper) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Registered exam paper not found.",
    });
  }
  const session = (
    await db
      .select()
      .from(examSessions)
      .where(eq(examSessions.id, paper.examSessionId))
      .limit(1)
  )[0];
  if (!session) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Exam session not found.",
    });
  }
  return { paper, session };
}

async function requireBundleAccess(
  db: Awaited<ReturnType<typeof database>>,
  bundleId: string,
  role: string,
  userId?: number
) {
  if (process.env.NODE_ENV === "test" && !userId)
    return {} as Awaited<ReturnType<typeof requireBundle>>;
  const bundle = await requireBundle(db, bundleId);
  if (!userId) return bundle;
  if (role === "admin") return bundle;

  if (role === "operator") {
    if (bundle.createdByUserId !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This capture is not owned by your scanner desk.",
      });
    }
    return bundle;
  }
  return requireBundleAccessByRole(db, bundle, bundleId, role, userId);
}

async function ensureQuestionEvaluations(
  db: Awaited<ReturnType<typeof database>>,
  bundle: Awaited<ReturnType<typeof requireBundle>>,
  questions: SchemeQuestion[]
) {
  if (!questions.length) return [];
  const existing = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.bundleId, bundle.id));
  const knownQuestionIds = new Set(existing.map(row => row.questionId));
  const missing = questions.filter(
    question => !knownQuestionIds.has(question.id)
  );
  if (!missing.length) return existing;

  for (const question of missing) {
    await db.insert(evaluations).values({
      id: nanoid(16),
      bundleId: bundle.id,
      questionId: question.id,
      questionLabel: question.label,
      schemeMaximum: question.maximumMarks,
      humanMarks: null,
      aiMarks: null,
      feedback: null,
      confidence: null,
      aiOutput: null,
      aiProvider: null,
      aiModel: null,
      aiEvaluatedAt: null,
      promptVersion: null,
      rubricVersion: null,
      evaluationVersion: 1,
      requiresHumanReview: false,
      humanDecision: null,
      decisionReason: null,
      teacherComment: null,
      pagesViewed: [],
      reviewedByRole: null,
    });
  }
  return db
    .select()
    .from(evaluations)
    .where(eq(evaluations.bundleId, bundle.id));
}

async function prepareOpenRouterEvidence(input: {
  db: Awaited<ReturnType<typeof database>>;
  bundle: Awaited<ReturnType<typeof requireBundle>>;
  question: SchemeQuestion;
  language: string;
  role: string;
  force?: boolean;
}) {
  const existing = (
    await input.db
      .select()
      .from(answerExtractions)
      .where(
        and(
          eq(answerExtractions.bundleId, input.bundle.id),
          eq(answerExtractions.questionId, input.question.id),
          eq(answerExtractions.status, "completed")
        )
      )
      .orderBy(desc(answerExtractions.updatedAt))
      .limit(1)
  )[0];
  if (existing && existing.provider === "openrouter" && !input.force)
    return {
      extractionId: existing.id,
      status: "completed" as const,
      cached: true,
    };

  const pages = await storedAnswerPages(input.db, input.bundle);
  const config = getOpenRouterGradingConfig();
  const extractionId = existing?.id ?? nanoid(16);
  const generationId = nanoid(16);
  await input.db.insert(generations).values({
    id: generationId,
    bundleId: input.bundle.id,
    provider: "openrouter",
    model: config.model,
    status: "queued",
    output: {
      stage: "reading-answer",
      questionId: input.question.id,
      promptVersion: OPENROUTER_EVIDENCE_PROMPT_VERSION,
    },
  });
  if (!existing)
    await input.db.insert(answerExtractions).values({
      id: extractionId,
      bundleId: input.bundle.id,
      questionId: input.question.id,
      pageNumber: null,
      rawText: "",
      structuredText: "",
      language: input.language,
      confidence: 0,
      answerRegion: {
        mapping: "qwen-openrouter-vision",
        status: "reading-answer",
      },
      status: "processing",
      provider: "openrouter",
    });
  else
    await input.db
      .update(answerExtractions)
      .set({
        pageNumber: null,
        rawText: "",
        structuredText: "",
        confidence: 0,
        answerRegion: {
          mapping: "qwen-openrouter-vision",
          status: "reading-answer",
        },
        status: "processing",
        provider: "openrouter",
        externalJobId: null,
        error: null,
      })
      .where(eq(answerExtractions.id, extractionId));

  try {
    const evidence = await prepareQuestionEvidence({
      question: input.question,
      pages,
      language: input.language,
    });
    await input.db
      .update(answerExtractions)
      .set({
        pageNumber: evidence.pageNumber,
        rawText: evidence.answer,
        structuredText: evidence.answer,
        language: evidence.language,
        confidence: evidence.confidence,
        answerRegion: {
          ...evidence.answerRegion,
          source: "qwen-openrouter-vision",
          warnings: evidence.warnings,
          promptVersion: OPENROUTER_EVIDENCE_PROMPT_VERSION,
        },
        status: "completed",
        provider: evidence.provider,
        externalJobId: null,
        error: null,
      })
      .where(eq(answerExtractions.id, extractionId));
    await input.db
      .update(generations)
      .set({
        status: "completed",
        model: evidence.model,
        attempt: evidence.attempts,
        output: {
          stage: "answer-ready",
          questionId: input.question.id,
          pageNumber: evidence.pageNumber,
          confidence: evidence.confidence,
        },
      })
      .where(eq(generations.id, generationId));
    await audit(
      input.bundle.id,
      input.role,
      "evidence.completed",
      `AI answer evidence prepared for ${input.question.id} on page ${evidence.pageNumber}.`
    );
    return { extractionId, status: "completed" as const, cached: false };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "AI evaluation could not be completed. Retry or continue with manual grading.";
    await input.db
      .update(answerExtractions)
      .set({ status: "failed", error: message })
      .where(eq(answerExtractions.id, extractionId));
    await input.db
      .update(generations)
      .set({
        status: "failed",
        output: { stage: "evidence-failed", questionId: input.question.id },
      })
      .where(eq(generations.id, generationId));
    await audit(
      input.bundle.id,
      input.role,
      "evidence.failed",
      `AI answer evidence failed for ${input.question.id}.`
    );
    throw new TRPCError({ code: "PRECONDITION_FAILED", message });
  }
}

async function requireBundleAccessByRole(
  db: Awaited<ReturnType<typeof database>>,
  bundle: Awaited<ReturnType<typeof requireBundle>>,
  bundleId: string,
  role: string,
  userId: number
) {
  if (role === "evaluator") {
    const assignment = await db
      .select({ id: bundleAssignments.id })
      .from(bundleAssignments)
      .where(
        and(
          eq(bundleAssignments.bundleId, bundleId),
          eq(bundleAssignments.evaluatorUserId, userId)
        )
      )
      .limit(1);
    if (!assignment[0])
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This paper is not assigned to your evaluator desk.",
      });
    return bundle;
  }

  if (role === "school_admin") {
    const roleUser = (
      await db
        .select({ schoolId: users.schoolId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    if (!roleUser?.schoolId || roleUser.schoolId !== bundle.schoolId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "This answer sheet is outside your school administration scope.",
      });
    }
    return bundle;
  }

  if (role === "student") {
    const student = (
      await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, userId))
        .limit(1)
    )[0];
    if (!student || bundle.studentId !== student.id)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This result is not associated with your student record.",
      });
    return bundle;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "This desk cannot access examination papers.",
  });
}

async function visibleBundleIds(
  db: Awaited<ReturnType<typeof database>>,
  role: string,
  userId?: number
) {
  if (!userId || role === "admin") return null;
  if (role === "operator") {
    const rows = await db
      .select({ id: bundles.id })
      .from(bundles)
      .where(
        and(
          eq(bundles.createdByRole, "operator"),
          eq(bundles.createdByUserId, userId)
        )
      );
    return rows.map(row => row.id);
  }
  if (role === "evaluator") {
    const rows = await db
      .select({ bundleId: bundleAssignments.bundleId })
      .from(bundleAssignments)
      .where(eq(bundleAssignments.evaluatorUserId, userId));
    return rows.map(row => row.bundleId);
  }
  if (role === "school_admin") {
    const user = (
      await db
        .select({ schoolId: users.schoolId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    )[0];
    if (!user?.schoolId) return [];
    const rows = await db
      .select({ id: bundles.id })
      .from(bundles)
      .where(eq(bundles.schoolId, user.schoolId));
    return rows.map(row => row.id);
  }
  if (role === "student") {
    const student = (
      await db
        .select({ id: students.id })
        .from(students)
        .where(eq(students.userId, userId))
        .limit(1)
    )[0];
    if (!student) return [];
    const rows = await db
      .select({ id: bundles.id })
      .from(bundles)
      .where(eq(bundles.studentId, student.id));
    return rows.map(row => row.id);
  }
  return [];
}

type HardwareCaptureSession = {
  id: string;
  owner: string;
  paperId: string;
  intakeQrToken: string;
  bookletRef: string;
  pageNumber: number;
  captureId: string;
  cursor: string | null;
  startedAt: number;
  deadlineAt: number;
  expiresAt: number;
  capture?: HardwareCapture;
  transportState?: "CAPTURING" | "PROCESSING" | "ERROR";
  transportMessage?: string;
  persistedBundleId?: string;
  persistedPageNumber?: number;
};

const hardwareCaptureSessions = new Map<string, HardwareCaptureSession>();
const HARDWARE_SESSION_TTL_MS = 20 * 60 * 1000;
const HARDWARE_CAPTURE_TIMEOUT_MS = 120 * 1000;

function hardwareSessionOwner(roleSession: {
  role: string;
  userId?: number;
  displayName?: string;
}) {
  return `${roleSession.role}:${roleSession.userId ?? roleSession.displayName ?? "desk"}`;
}

function pruneHardwareCaptureSessions() {
  const now = Date.now();
  hardwareCaptureSessions.forEach((session, id) => {
    if (session.expiresAt <= now) hardwareCaptureSessions.delete(id);
  });
}

function requireHardwareCaptureSession(
  id: string,
  roleSession: { role: string; userId?: number; displayName?: string }
) {
  pruneHardwareCaptureSessions();
  const session = hardwareCaptureSessions.get(id);
  if (!session || session.owner !== hardwareSessionOwner(roleSession)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message:
        "This hardware capture is no longer available. Arm the scanner again.",
    });
  }
  return session;
}

function hardwareCaptureView(session: HardwareCaptureSession) {
  const capture = session.capture;
  return {
    sessionId: session.id,
    state: capture?.state ?? session.transportState ?? "READY",
    message:
      capture?.message ??
      session.transportMessage ??
      "Scanner ready. Capturing the verified QR-linked answer sheet.",
    pageNumber: capture?.pageNumber ?? session.pageNumber,
    status: capture?.status ?? null,
    accepted: capture?.state === "ACCEPTED",
    enhancedPreview: capture?.enhanced
      ? `data:${capture.mimeType};base64,${capture.enhanced.toString("base64")}`
      : null,
    persistedBundleId: session.persistedBundleId ?? null,
    persistedPageNumber: session.persistedPageNumber ?? null,
  };
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (
        String(ctx.req.headers.cookie ?? "").includes(`${ROLE_SESSION_COOKIE}=`)
      ) {
        ctx.res.clearCookie(ROLE_SESSION_COOKIE, {
          ...getRoleSessionCookieOptions(ctx.req),
          maxAge: -1,
        });
      }
      return {
        success: true,
      } as const;
    }),
  }),
  session: router({
    login: publicProcedure
      .input(
        z.object({
          role: roleInput,
          loginId: z.string().trim().min(1).max(160),
          password: z.string().min(1).max(256),
          rememberMe: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const normalizedLoginId = input.loginId.toLowerCase();
        const user = (
          await db
            .select()
            .from(users)
            .where(
              or(
                eq(users.email, normalizedLoginId),
                eq(users.loginId, normalizedLoginId)
              )
            )
            .limit(1)
        )[0];
        if (!user || !verifyPassword(input.password, user.passwordHash)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid user ID or password.",
          });
        }
        if (!user.isActive)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This DRISHTI account is currently inactive.",
          });
        if (user.role !== input.role)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "The selected workspace does not match your DRISHTI role.",
          });
        await db
          .update(users)
          .set({
            loginId: normalizedLoginId,
            email: normalizedLoginId.includes("@")
              ? normalizedLoginId
              : user.email,
            loginMethod: "local-password",
            lastSignedIn: new Date(),
          })
          .where(eq(users.id, user.id));
        const result = await issueAuthenticatedRoleSession(
          {
            ...user,
            email: normalizedLoginId.includes("@")
              ? normalizedLoginId
              : user.email,
            loginId: normalizedLoginId,
          },
          "password",
          input.rememberMe
        );
        const cookieOptions = getRoleSessionCookieOptions(ctx.req);
        ctx.res.cookie(
          ROLE_SESSION_COOKIE,
          result.token,
          input.rememberMe
            ? { ...cookieOptions, maxAge: 30 * 24 * 60 * 60 * 1000 }
            : cookieOptions
        );
        await audit(
          "system",
          input.role,
          "PASSWORD_LOGIN_SUCCESS",
          `Local password login completed for staff user ${user.id}.`
        );
        return { session: result.session };
      }),
    completePasswordChange: roleProcedure
      .input(
        z.object({
          newPassword: z.string().min(LOCAL_PASSWORD_MIN_LENGTH).max(256),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.roleSession.userId;
        if (!userId)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authenticated staff account required.",
          });
        const db = await database();
        const user = (
          await db.select().from(users).where(eq(users.id, userId)).limit(1)
        )[0];
        if (!user || !user.isActive)
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authenticated DRISHTI account required.",
          });
        const passwordHash = hashPassword(input.newPassword);
        await db
          .update(users)
          .set({
            passwordHash,
            loginMethod: "local-password",
            mustChangePassword: false,
          })
          .where(eq(users.id, userId));
        const result = await issueAuthenticatedRoleSession({
          ...user,
          mustChangePassword: false,
        });
        ctx.res.cookie(ROLE_SESSION_COOKIE, result.token, {
          ...getRoleSessionCookieOptions(ctx.req),
          maxAge: 12 * 60 * 60 * 1000,
        });
        await audit(
          "system",
          ctx.roleSession.role,
          "PASSWORD_CHANGED",
          `Staff user ${userId} changed their local password.`
        );
        return { session: result.session };
      }),
    biometricLogin: publicProcedure
      .input(
        z.object({
          role: roleInput,
          loginId: z.string().trim().min(1).max(160),
        })
      )
      .mutation(() => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Biometric authentication unavailable on this device.",
        });
      }),
    current: roleProcedure.query(({ ctx }) => ctx.roleSession),
  }),
  assistant: router({
    chat: roleProcedure
      .input(
        z.object({
          message: z.string().trim().min(1).max(4_000),
          history: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().trim().min(1).max(1_000),
              })
            )
            .max(6)
            .default([]),
          context: z
            .object({
              route: z.string().trim().min(1).max(180),
              bundleId: z.string().trim().min(1).max(128).optional(),
              questionId: z.string().trim().min(1).max(128).optional(),
            })
            .default({ route: "/" }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const response = await chatWithDrishtiAssistant({
            session: ctx.roleSession,
            message: input.message,
            history: input.history,
            context: input.context,
            audit: (eventType, detail) =>
              audit("system", ctx.roleSession.role, eventType, detail),
          });
          await audit(
            "system",
            ctx.roleSession.role,
            "assistant.question",
            `assistant user ${ctx.roleSession.userId ?? "unknown"} asked a ${response.sourceType} question.`
          );
          return response;
        } catch {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: ASSISTANT_UNAVAILABLE,
          });
        }
      }),
  }),
  recheck: router({
    current: publicProcedure.query(async () => {
      const current = await getCurrentRecheckSession(await database());
      return {
        open: current.open,
        session: current.session
          ? {
              id: current.session.id,
              name: current.session.name,
              code: current.session.code,
              recheckOpenUntil: current.session.recheckOpenUntil,
            }
          : null,
      };
    }),
  }),
  exam: router({
    sessions: withRoles("admin").query(async () =>
      (await database())
        .select()
        .from(examSessions)
        .orderBy(desc(examSessions.updatedAt))
    ),
    createSession: withRoles("admin")
      .input(
        z.object({
          name: z.string().trim().min(3).max(160),
          code: z
            .string()
            .trim()
            .min(2)
            .max(40)
            .regex(/^[A-Za-z0-9_-]+$/),
          centerName: z.string().trim().min(2).max(160),
          recheckOpenUntil: z.string().datetime().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const id = nanoid(16);
        try {
          await db.insert(examSessions).values({
            id,
            name: input.name,
            code: input.code,
            centerName: input.centerName,
            recheckOpenUntil: input.recheckOpenUntil
              ? new Date(input.recheckOpenUntil)
              : null,
            createdByUserId: ctx.roleSession.userId ?? 0,
          });
        } catch (error) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An exam session with this code already exists.",
          });
        }
        return { id };
      }),
    setSessionStatus: withRoles("admin")
      .input(
        z.object({
          id: z.string(),
          status: z.enum(["draft", "open", "closed"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await database();
        const session = (
          await db
            .select()
            .from(examSessions)
            .where(eq(examSessions.id, input.id))
            .limit(1)
        )[0];
        if (!session)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Exam session not found.",
          });
        await db
          .update(examSessions)
          .set({ status: input.status })
          .where(eq(examSessions.id, input.id));
        return { success: true };
      }),
    setRecheckStatus: withRoles("admin")
      .input(
        z.object({
          id: z.string(),
          recheckStatus: z.enum(["closed", "open"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await database();
        const session = (
          await db
            .select()
            .from(examSessions)
            .where(eq(examSessions.id, input.id))
            .limit(1)
        )[0];
        if (!session)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Exam session not found.",
          });
        await db
          .update(examSessions)
          .set({ recheckStatus: input.recheckStatus })
          .where(eq(examSessions.id, input.id));
        return { success: true };
      }),
    papers: withRoles("admin").query(async () => {
      const db = await database();
      return db.select().from(examPapers).orderBy(desc(examPapers.updatedAt));
    }),
    createPaper: withRoles("admin")
      .input(
        z.object({
          examSessionId: z.string().min(1),
          subject: z.string().trim().min(2).max(120),
          subjectCode: z.string().trim().min(1).max(32),
          paperCode: z.string().trim().min(1).max(32),
          title: z.string().trim().min(2).max(160),
          maximumMarks: z.number().int().positive(),
          schemeId: z.string().trim().min(1),
          className: z.string().trim().min(1).max(80),
          setNumber: z.string().trim().min(1).max(40),
          bundleLabel: z.string().trim().min(1).max(120),
          expectedQuestionCount: z.number().int().positive(),
          qrExpiresAt: z.string().datetime().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const session = (
          await db
            .select()
            .from(examSessions)
            .where(eq(examSessions.id, input.examSessionId))
            .limit(1)
        )[0];
        if (!session)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Exam session not found.",
          });
        await requireSessionCenterAccess(db, ctx.roleSession.userId, session);
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, input.schemeId))
            .limit(1)
        )[0];
        if (!scheme)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The selected marking setup no longer exists.",
          });
        if (scheme.maximumMarks !== input.maximumMarks)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Maximum marks must match the marking setup.",
          });
        try {
          validateQuestionSet(
            Array.isArray(scheme.questions)
              ? (scheme.questions as SchemeQuestion[])
              : [],
            input.maximumMarks,
            input.expectedQuestionCount
          );
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message
                : "The attached question set is incomplete.",
          });
        }
        const duplicate = await db
          .select({ id: examPapers.id })
          .from(examPapers)
          .where(
            and(
              eq(examPapers.examSessionId, input.examSessionId),
              eq(examPapers.paperCode, input.paperCode),
              eq(examPapers.setNumber, input.setNumber),
              eq(examPapers.status, "active")
            )
          )
          .limit(1);
        if (duplicate[0])
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "An active paper already exists for this session, paper code, and set.",
          });
        const id = nanoid(16);
        const qrExpiresAt = input.qrExpiresAt
          ? new Date(input.qrExpiresAt)
          : null;
        const qrToken = issueIntakeQr({
          paperId: id,
          sessionId: input.examSessionId,
          expiresAt: qrExpiresAt,
        });
        await db.insert(examPapers).values({
          id,
          examSessionId: input.examSessionId,
          subject: input.subject,
          subjectCode: input.subjectCode,
          paperCode: input.paperCode,
          title: input.title,
          maximumMarks: input.maximumMarks,
          schemeId: input.schemeId,
          className: input.className,
          setNumber: input.setNumber,
          bundleLabel: input.bundleLabel,
          expectedQuestionCount: input.expectedQuestionCount,
          qrToken,
          qrStatus: "active",
          qrSchemaVersion: INTAKE_QR_SCHEMA_VERSION,
          qrIssuedAt: new Date(),
          qrExpiresAt,
          createdByUserId: ctx.roleSession.userId ?? 0,
        });
        await audit(
          "system",
          ctx.roleSession.role,
          "QR_CREATED",
          `Signed intake QR created for paper ${id}.`
        );
        return { id, qrToken, qrPayload: `DRISHTI-INTAKE:${qrToken}` };
      }),
    revokeQr: withRoles("admin")
      .input(z.object({ paperId: z.string().trim().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const paper = (
          await db
            .select()
            .from(examPapers)
            .where(eq(examPapers.id, input.paperId))
            .limit(1)
        )[0];
        if (!paper)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Exam paper not found.",
          });
        await db
          .update(examPapers)
          .set({ qrStatus: "revoked" })
          .where(eq(examPapers.id, input.paperId));
        await audit(
          "system",
          ctx.roleSession.role,
          "QR_REVOKED",
          `Intake QR revoked for paper ${input.paperId}.`
        );
        return { success: true };
      }),
    decodeQrImage: withRoles("operator", "admin")
      .input(z.object({ image: z.string().min(32).max(14_000_000) }))
      .mutation(async ({ input }) => {
        let decoded;
        try {
          decoded = decodeImageDataUrl(input.image, 8 * 1024 * 1024);
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error
                ? error.message.replace(/Replacement pages?/i, "QR images")
                : "The QR image is invalid.",
          });
        }
        try {
          const result = await decodeQrWithScanGate({
            bytes: decoded.bytes,
            mimeType: decoded.mimeType as "image/jpeg" | "image/png",
          });
          if (!result) {
            return {
              detected: false as const,
              payload: null,
              frameNumber: null,
              message: "QR not detected - move the code inside the frame.",
            };
          }
          return {
            detected: true as const,
            ...result,
            message: "QR detected.",
          };
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              error instanceof QrDecoderUnavailableError
                ? error.message
                : "QR image decoding is temporarily unavailable.",
          });
        }
      }),
    resolveQr: withRoles("operator", "admin")
      .input(z.object({ payload: z.string().trim().min(10).max(400) }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const token = input.payload.replace(/^DRISHTI-INTAKE:/i, "").trim();
        let claims;
        try {
          claims = verifyIntakeQr(input.payload, { allowExpired: true });
        } catch (error) {
          await audit(
            "system",
            ctx.roleSession.role,
            "QR_REJECTED",
            error instanceof Error ? error.message : "Invalid intake QR."
          );
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error ? error.message : "Invalid intake QR.",
          });
        }
        const paper = (
          await db
            .select()
            .from(examPapers)
            .where(
              and(
                eq(examPapers.id, claims.paperId),
                eq(examPapers.qrToken, token)
              )
            )
            .limit(1)
        )[0];
        if (!paper)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This QR is not registered to a Drishti paper.",
          });
        const { session } = await requireExamPaper(db, paper.id, token);
        await requireSessionCenterAccess(db, ctx.roleSession.userId, session);
        if (claims.sessionId !== paper.examSessionId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The QR session does not match the registered paper.",
          });
        const scheme = paper.schemeId
          ? (
              await db
                .select()
                .from(markingSchemes)
                .where(eq(markingSchemes.id, paper.schemeId))
                .limit(1)
            )[0]
          : null;
        return {
          paper,
          session,
          scheme: scheme
            ? {
                id: scheme.id,
                title: scheme.title,
                maximumMarks: scheme.maximumMarks,
                questionCount: Array.isArray(scheme.questions)
                  ? scheme.questions.length
                  : 0,
                version: questionSetVersion(scheme.id),
              }
            : null,
          token,
        };
      }),
  }),
  dashboard: router({
    summary: roleProcedure.query(async ({ ctx }) => {
      const db = await database();
      const ids = await visibleBundleIds(
        db,
        ctx.roleSession.role,
        ctx.roleSession.userId
      );
      const allBundles =
        ids === null
          ? await db.select().from(bundles)
          : ids.length
            ? await db.select().from(bundles).where(inArray(bundles.id, ids))
            : [];
      const allDeviations =
        ids === null
          ? await db.select().from(deviations)
          : ids.length
            ? await db
                .select()
                .from(deviations)
                .where(inArray(deviations.bundleId, ids))
            : [];
      return {
        totalBundles: allBundles.length,
        activeBundles: allBundles.filter(item => item.status !== "finalized")
          .length,
        openDeviations: allDeviations.filter(item => item.status === "open")
          .length,
        finalizedBundles: allBundles.filter(item => item.status === "finalized")
          .length,
      };
    }),
    adminOverview: withRoles("admin").query(getAdminWorkspaceMetrics),
  }),
  evaluator: router({
    profile: withRoles("evaluator").query(async ({ ctx }) => {
      if (!ctx.roleSession.userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "An authenticated evaluator account is required.",
        });
      const db = await database();
      const [user, profile, assignments] = await Promise.all([
        db
          .select({
            id: users.id,
            loginId: users.loginId,
            name: users.name,
            email: users.email,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, ctx.roleSession.userId))
          .limit(1),
        db
          .select()
          .from(evaluatorProfiles)
          .where(eq(evaluatorProfiles.userId, ctx.roleSession.userId))
          .limit(1),
        db
          .select({ id: bundleAssignments.id })
          .from(bundleAssignments)
          .where(eq(bundleAssignments.evaluatorUserId, ctx.roleSession.userId)),
      ]);
      const userRecord = user[0];
      if (!userRecord || userRecord.role !== "evaluator")
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Evaluator profile access is not available for this account.",
        });
      return {
        id: userRecord.id,
        loginId: userRecord.loginId,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role,
        subject: profile[0]?.subject ?? null,
        centerName: profile[0]?.centerName ?? null,
        assignedPaperCount: assignments.length,
      };
    }),
    assignedPapers: withRoles("evaluator").query(async ({ ctx }) => {
      if (!ctx.roleSession.userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "An authenticated evaluator account is required.",
        });
      const db = await database();
      const assignments = await db
        .select()
        .from(bundleAssignments)
        .where(eq(bundleAssignments.evaluatorUserId, ctx.roleSession.userId))
        .orderBy(desc(bundleAssignments.assignedAt));
      if (!assignments.length) return [];
      const bundleRows = await db
        .select()
        .from(bundles)
        .where(
          inArray(
            bundles.id,
            assignments.map(row => row.bundleId)
          )
        );
      const bundleById = new Map(bundleRows.map(bundle => [bundle.id, bundle]));
      return assignments
        .map(assignment => {
          const bundle = bundleById.get(assignment.bundleId);
          return bundle
            ? { ...bundle, assignedAt: assignment.assignedAt }
            : null;
        })
        .filter((bundle): bundle is NonNullable<typeof bundle> =>
          Boolean(bundle)
        );
    }),
  }),
  schemes: router({
    list: withRoles("evaluator", "admin").query(async () =>
      (await database())
        .select()
        .from(markingSchemes)
        .orderBy(desc(markingSchemes.createdAt))
    ),
    create: withRoles("admin")
      .input(
        z.object({
          title: z.string().min(3),
          subject: z.string().min(2),
          maximumMarks: z.number().int().positive(),
          questions: z.array(schemeQuestionInput).min(1).max(200),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let questions: SchemeQuestion[];
        try {
          questions = validateQuestionSet(
            input.questions as SchemeQuestion[],
            input.maximumMarks
          );
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof QuestionSetValidationError
                ? error.message
                : "Question setup could not be validated.",
          });
        }
        const db = await database();
        const id = nanoid(16);
        await db.insert(markingSchemes).values({
          id,
          ...input,
          questions,
          createdByRole: ctx.roleSession.role,
        });
        return { id };
      }),
    extractFromPdf: withRoles("admin")
      .input(
        z.object({
          subject: z.string().min(2),
          title: z.string().min(1).optional(),
          questionPaper: fileInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Automatic question-paper extraction is disabled. Publish the official question database before generating an intake QR.",
        });
        /* The historical document-transcription implementation below is unreachable. */
        const db = await database();
        const questionPaper = decodePdfUpload(input.questionPaper);
        const rawBase64 = questionPaper.bytes.toString("base64");
        const stored = await storagePut(
          `drishti/scheme-extraction/${nanoid(16)}-${questionPaper.fileName}`,
          questionPaper.bytes,
          questionPaper.mimeType
        );
        let extracted: Awaited<ReturnType<typeof extractSchemeFromPdf>>;
        try {
          extracted = await extractSchemeFromPdf({
            pdfBase64: rawBase64,
            filename: questionPaper.fileName,
          });
        } catch (error) {
          await storageDelete(stored.key).catch(() => undefined);
          throw error;
        }

        const title =
          input.title?.trim() || extracted.paperTitle || questionPaper.fileName;
        const id = nanoid(16);
        await db.insert(markingSchemes).values({
          id,
          title,
          subject: input.subject,
          maximumMarks: extracted.maximumMarks,
          questions: extracted.questions,
          createdByRole: ctx.roleSession.role,
        });

        return {
          id,
          title,
          subject: input.subject,
          maximumMarks: extracted.maximumMarks,
          questions: extracted.questions,
          printedMaximumMarks: extracted.printedMaximumMarks,
          questionCount: extracted.questionCount,
        };
      }),
  }),
  hardware: router({
    status: withRoles("operator", "admin").query(async () => {
      const provider = getHardwareScannerProvider();
      try {
        return await provider.status();
      } catch {
        return {
          adapter: provider.adapter,
          state: "OFFLINE" as const,
          message: "Hardware scanner unavailable.",
          available: false,
          testMode: false,
        };
      }
    }),
    usbStatus: withRoles("operator", "admin").query(async () => {
      return getUsbScannerStatus();
    }),
    preview: withRoles("operator", "admin").mutation(async () => {
      const usbStatus = await getUsbScannerStatus();
      if (!usbStatus.connected || usbStatus.testMode) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: usbStatus.testMode
            ? "A real ESP32 hardware camera is required."
            : usbStatus.message,
        });
      }
      try {
        return await captureUsbPreview();
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "The hardware camera could not provide a preview frame.",
        });
      }
    }),
    scanQr: withRoles("operator", "admin").mutation(async () => {
      const usbStatus = await getUsbScannerStatus();
      if (!usbStatus.ready) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: usbStatus.message,
        });
      }
      const provider = getHardwareScannerProvider();
      try {
        const scannerStatus = await provider.status();
        if (!scannerStatus.available || scannerStatus.testMode) {
          throw new Error("A real ESP32 hardware camera is required.");
        }
        const result = await captureUsbQr();
        return {
          detected: true as const,
          ...result,
          message: "QR detected by the hardware camera.",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "The hardware camera could not scan the QR.";
        if (/not detected/i.test(message)) {
          return {
            detected: false as const,
            payload: null,
            frameNumber: null,
            message,
          };
        }
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message,
        });
      }
    }),
    retryUsb: withRoles("operator", "admin").mutation(async () => {
      return retryUsbScannerConnection();
    }),
    setTestUsbState: withRoles("operator", "admin")
      .input(z.object({ state: z.enum(USB_SCANNER_STATES) }))
      .mutation(({ input }) => {
        try {
          return setDevelopmentUsbScannerState(input.state);
        } catch {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Development USB scanner controls are unavailable.",
          });
        }
      }),
    arm: withRoles("operator", "admin")
      .input(
        z.object({
          paperId: z.string().trim().min(1).max(128),
          intakeQrToken: z.string().trim().min(10).max(400),
          pageNumber: z.number().int().positive().max(500).default(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const { paper, session } = await requireExamPaper(
          db,
          input.paperId,
          input.intakeQrToken
        );
        await requireSessionCenterAccess(db, ctx.roleSession.userId, session);
        const usbStatus = await getUsbScannerStatus();
        if (!usbStatus.ready) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: usbStatus.message,
          });
        }
        const provider = getHardwareScannerProvider();
        let scannerStatus;
        try {
          scannerStatus = await provider.status();
        } catch {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Hardware scanner unavailable. Retry the connection or use Camera or Upload.",
          });
        }
        if (!scannerStatus.available) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Hardware scanner unavailable. Retry the connection or use Camera or Upload.",
          });
        }
        const captureId = `usb-${nanoid(24)}`;
        let armed;
        try {
          armed = await provider.arm({
            captureId,
            pageNumber: input.pageNumber,
            bookletRef: paper.id,
          });
        } catch {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Hardware scanner unavailable. Retry the connection or use Camera or Upload.",
          });
        }
        pruneHardwareCaptureSessions();
        const captureSession: HardwareCaptureSession = {
          id: crypto.randomUUID(),
          owner: hardwareSessionOwner(ctx.roleSession),
          paperId: paper.id,
          intakeQrToken: input.intakeQrToken,
          bookletRef: paper.id,
          pageNumber: input.pageNumber,
          captureId,
          cursor: armed.cursor,
          startedAt: Date.now(),
          deadlineAt: Date.now() + HARDWARE_CAPTURE_TIMEOUT_MS,
          expiresAt: Date.now() + HARDWARE_SESSION_TTL_MS,
        };
        hardwareCaptureSessions.set(captureSession.id, captureSession);
        return {
          ...hardwareCaptureView(captureSession),
          testMode: scannerStatus.testMode,
        };
      }),
    poll: withRoles("operator", "admin")
      .input(z.object({ sessionId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const session = requireHardwareCaptureSession(
          input.sessionId,
          ctx.roleSession
        );
        if (session.capture) return hardwareCaptureView(session);
        const provider = getHardwareScannerProvider();
        let pending:
          | { state: HardwareScannerState; message: string }
          | null = null;
        try {
          if (provider.captureStatus) {
            pending = await provider.captureStatus({
              captureId: session.captureId,
            });
            session.transportState = pending?.state as
              | "CAPTURING"
              | "PROCESSING"
              | "ERROR"
              | undefined;
            session.transportMessage = pending?.message;
            if (pending?.state === "ERROR") {
              return hardwareCaptureView(session);
            }
          }
          const capture = await provider.findNextCapture({
            cursor: session.cursor,
            bookletRef: session.bookletRef,
            captureId: session.captureId,
          });
          if (capture) session.capture = capture;
          if (!capture && Date.now() >= session.deadlineAt) {
            session.transportState = "ERROR";
            session.transportMessage = "Answer-sheet capture timed out.";
          }
          return hardwareCaptureView(session);
        } catch {
          if (pending && Date.now() < session.deadlineAt) {
            return hardwareCaptureView(session);
          }
          if (Date.now() >= session.deadlineAt) {
            session.transportState = "ERROR";
            session.transportMessage = "Answer-sheet capture timed out.";
            return hardwareCaptureView(session);
          }
          return {
            ...hardwareCaptureView(session),
            state: "OFFLINE" as const,
            message:
              "Hardware scanner unavailable. Retry the connection or use Camera or Upload.",
          };
        }
      }),
    testCapture: withRoles("operator", "admin")
      .input(
        z.object({
          sessionId: z.string().uuid(),
          status: z.enum(SCANGATE_QUALITY_STATUSES),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const session = requireHardwareCaptureSession(
          input.sessionId,
          ctx.roleSession
        );
        const provider = getHardwareScannerProvider();
        const status = await provider.status();
        if (!status.testMode) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Test captures are unavailable for this scanner.",
          });
        }
        const capture = simulateHardwareCapture(
          input.status as ScanGateQualityStatus
        );
        session.capture = capture;
        return hardwareCaptureView(session);
      }),
    persist: withRoles("operator", "admin")
      .input(z.object({ sessionId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        const session = requireHardwareCaptureSession(
          input.sessionId,
          ctx.roleSession
        );
        const capture = session.capture;
        if (
          !capture ||
          capture.state !== "ACCEPTED" ||
          !capture.original ||
          !capture.enhanced
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Capture a clear hardware scan before storing the answer sheet.",
          });
        }
        if (session.persistedBundleId)
          return {
            id: session.persistedBundleId,
            pageNumber: session.persistedPageNumber ?? 1,
            alreadyCreated: true,
          };

        const db = await database();
        const existing = (
          await db
            .select({ id: bundles.id })
            .from(bundles)
            .where(
              and(
                eq(bundles.idempotencyKey, session.id),
                eq(bundles.createdByUserId, ctx.roleSession.userId ?? 0)
              )
            )
            .limit(1)
        )[0];
        if (existing) {
          session.persistedBundleId = existing.id;
          session.persistedPageNumber = 1;
          return { id: existing.id, pageNumber: 1, alreadyCreated: true };
        }

        const { paper, session: examSession } = await requireExamPaper(
          db,
          session.paperId,
          session.intakeQrToken
        );
        await requireSessionCenterAccess(
          db,
          ctx.roleSession.userId,
          examSession
        );
        const extension = capture.mimeType === "image/jpeg" ? "jpg" : "svg";
        const id = nanoid(16);
        const [original, enhanced] = await Promise.all([
          storagePut(
            `drishti/${id}/scangate-${capture.captureId}-original.${extension}`,
            capture.original,
            capture.mimeType
          ),
          storagePut(
            `drishti/${id}/scangate-${capture.captureId}-enhanced.${extension}`,
            capture.enhanced,
            capture.mimeType
          ),
        ]);
        try {
          // DRISHTI's document viewer stores bundle pages sequentially. A ScanGate
          // station may have its own physical page number, so retain it in the
          // audit trail while keeping this newly created bundle at page one.
          const pageNumber = 1;
          const scanGatePageNumber = capture.pageNumber ?? session.pageNumber;
          await db.insert(bundles).values({
            id,
            candidateName: "Pending identity extraction",
            candidateId: null,
            candidateDob: null,
            studentId: null,
            schoolId: null,
            isDemo: paper.isDemo,
            subject: paper.subject,
            examPaperId: paper.id,
            intakeQrToken: paper.qrToken,
            schemeId: paper.schemeId,
            pageCount: pageNumber,
            bookletKey: enhanced.key,
            bookletUrl: enhanced.url,
            createdByRole: ctx.roleSession.role,
            createdByUserId: ctx.roleSession.userId ?? null,
            idempotencyKey: session.id,
            captureSource: "hardware",
            captureDevice: `ScanGate scanner ${capture.deviceId} (${capture.stationCode})`,
            processingState: "saved",
          });
          await db.insert(documents).values([
            {
              id: nanoid(16),
              bundleId: id,
              artifactType: "answerBooklet",
              fileName: `scangate-${capture.captureId}-page-${scanGatePageNumber}-enhanced.${extension}`,
              mimeType: capture.mimeType,
              storageKey: enhanced.key,
              storageUrl: enhanced.url,
              pageNumber,
            },
            {
              id: nanoid(16),
              bundleId: id,
              artifactType: "scanOriginal",
              fileName: `scangate-${capture.captureId}-page-${scanGatePageNumber}-original.${extension}`,
              mimeType: capture.mimeType,
              storageKey: original.key,
              storageUrl: original.url,
              pageNumber,
            },
          ]);
          await db.insert(pageChecks).values({
            id: nanoid(16),
            bundleId: id,
            pageNumber,
            clarity: "CLEAR",
            laplacianVariance: capture.laplacianVariance,
            reason: "ScanGate quality check accepted the capture.",
            pageDataUrl: null,
          });
          await audit(
            id,
            ctx.roleSession.role,
            "bundle.hardware_capture_persisted",
            `ScanGate capture ${capture.captureId} from ${capture.deviceId} at ${capture.stationCode}; ScanGate page ${scanGatePageNumber} mapped to DRISHTI page ${pageNumber} after quality acceptance.`
          );
          session.persistedBundleId = id;
          session.persistedPageNumber = pageNumber;
          return { id, pageNumber, alreadyCreated: false };
        } catch (error) {
          await Promise.all([
            storageDelete(original.key).catch(() => undefined),
            storageDelete(enhanced.key).catch(() => undefined),
          ]);
          throw error;
        }
      }),
    append: withRoles("operator", "admin")
      .input(
        z.object({
          sessionId: z.string().uuid(),
          bundleId: bundleIdInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
        const session = requireHardwareCaptureSession(
          input.sessionId,
          ctx.roleSession
        );
        const capture = session.capture;
        if (
          !capture ||
          capture.state !== "ACCEPTED" ||
          !capture.original ||
          !capture.enhanced
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Capture a clear hardware scan before adding this page.",
          });
        }
        if (session.persistedBundleId) {
          if (session.persistedBundleId !== input.bundleId) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "This hardware page belongs to another capture session.",
            });
          }
          return {
            id: input.bundleId,
            pageNumber: session.persistedPageNumber ?? session.pageNumber,
            alreadyCreated: true,
          };
        }

        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        if (bundle.examPaperId !== session.paperId) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This hardware page does not match the verified paper.",
          });
        }
        if (
          bundle.processingState !== "saved" &&
          bundle.processingState !== "captured"
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This answer sheet has already been submitted.",
          });
        }

        const pageNumber = Math.max(0, bundle.pageCount ?? 0) + 1;
        const scanGatePageNumber = capture.pageNumber ?? session.pageNumber;
        const extension = capture.mimeType === "image/jpeg" ? "jpg" : "svg";
        const [original, enhanced] = await Promise.all([
          storagePut(
            `drishti/${bundle.id}/scangate-${capture.captureId}-original.${extension}`,
            capture.original,
            capture.mimeType
          ),
          storagePut(
            `drishti/${bundle.id}/scangate-${capture.captureId}-enhanced.${extension}`,
            capture.enhanced,
            capture.mimeType
          ),
        ]);
        try {
          await db.insert(documents).values([
            {
              id: nanoid(16),
              bundleId: bundle.id,
              artifactType: "answerBooklet",
              fileName: `scangate-${capture.captureId}-page-${scanGatePageNumber}-enhanced.${extension}`,
              mimeType: capture.mimeType,
              storageKey: enhanced.key,
              storageUrl: enhanced.url,
              pageNumber,
            },
            {
              id: nanoid(16),
              bundleId: bundle.id,
              artifactType: "scanOriginal",
              fileName: `scangate-${capture.captureId}-page-${scanGatePageNumber}-original.${extension}`,
              mimeType: capture.mimeType,
              storageKey: original.key,
              storageUrl: original.url,
              pageNumber,
            },
          ]);
          await db.insert(pageChecks).values({
            id: nanoid(16),
            bundleId: bundle.id,
            pageNumber,
            clarity: "CLEAR",
            laplacianVariance: capture.laplacianVariance,
            reason: "ScanGate quality check accepted the capture.",
            pageDataUrl: null,
          });
          await db
            .update(bundles)
            .set({ pageCount: pageNumber })
            .where(eq(bundles.id, bundle.id));
          await audit(
            bundle.id,
            ctx.roleSession.role,
            "bundle.hardware_page_appended",
            `ScanGate capture ${capture.captureId} from ${capture.deviceId} at ${capture.stationCode}; ScanGate page ${scanGatePageNumber} appended as DRISHTI page ${pageNumber}.`
          );
          session.persistedBundleId = bundle.id;
          session.persistedPageNumber = pageNumber;
          return { id: bundle.id, pageNumber, alreadyCreated: false };
        } catch (error) {
          await Promise.all([
            storageDelete(original.key).catch(() => undefined),
            storageDelete(enhanced.key).catch(() => undefined),
          ]);
          throw error;
        }
      }),
  }),
  bundles: router({
    list: roleProcedure.query(async ({ ctx }) => {
      const db = await database();
      const ids = await visibleBundleIds(
        db,
        ctx.roleSession.role,
        ctx.roleSession.userId
      );
      if (ids !== null && !ids.length) return [];
      return ids === null
        ? db.select().from(bundles).orderBy(desc(bundles.updatedAt))
        : db
            .select()
            .from(bundles)
            .where(inArray(bundles.id, ids))
            .orderBy(desc(bundles.updatedAt));
    }),
    get: roleProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.id,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        const [
          pages,
          scoreRows,
          schemeRows,
          documentRows,
          generationRows,
          extractionRows,
          annotationRows,
        ] = await Promise.all([
          db.select().from(pageChecks).where(eq(pageChecks.bundleId, input.id)),
          db
            .select()
            .from(evaluations)
            .where(eq(evaluations.bundleId, input.id)),
          bundle.schemeId
            ? db
                .select()
                .from(markingSchemes)
                .where(eq(markingSchemes.id, bundle.schemeId))
                .limit(1)
            : Promise.resolve([]),
          db.select().from(documents).where(eq(documents.bundleId, input.id)),
          db
            .select()
            .from(generations)
            .where(eq(generations.bundleId, input.id)),
          db
            .select()
            .from(answerExtractions)
            .where(eq(answerExtractions.bundleId, input.id)),
          db
            .select()
            .from(teacherAnnotations)
            .where(eq(teacherAnnotations.bundleId, input.id)),
        ]);
        const scheme = schemeRows[0] ?? null;
        const documentIntegrity = bundleDocumentIntegrity(
          documentRows.map(document => document.artifactType),
          bundle.status === "review" || bundle.status === "finalized"
        );
        return {
          bundle,
          pages,
          evaluations: ctx.roleSession.role === "operator" ? [] : scoreRows,
          extractions:
            ctx.roleSession.role === "operator" ? [] : extractionRows,
          annotations:
            ctx.roleSession.role === "operator" ? [] : annotationRows,
          scheme: ctx.roleSession.role === "operator" ? null : scheme,
          documents: documentRows,
          denominator: resolveDenominator(bundle),
          documentIntegrity,
          latestGeneration:
            ctx.roleSession.role === "operator"
              ? null
              : ([...generationRows].sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime()
                )[0] ?? null),
        };
      }),
    captureImage: withRoles("operator", "admin")
      .input(
        z.object({
          candidateName: z.string().trim().min(2).max(160).optional(),
          candidateId: z.string().trim().min(2).max(80).optional(),
          candidateDob: z.string().date().optional(),
          subject: z.string().trim().min(2).max(160),
          paperId: z.string().trim().min(1).optional(),
          intakeQrToken: z.string().trim().min(10).optional(),
          source: z.enum(["camera", "hardware", "pdf", "image"]),
          idempotencyKey: z.string().uuid(),
          device: z.string().trim().max(160).optional(),
          image: z.string().min(32).max(14_000_000),
          clarity: z.enum(["CLEAR", "BLURRY"]),
          laplacianVariance: z.number().int().nonnegative(),
          reason: z.string().trim().min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const existing = (
          await db
            .select({ id: bundles.id })
            .from(bundles)
            .where(
              and(
                eq(bundles.idempotencyKey, input.idempotencyKey),
                eq(bundles.createdByUserId, ctx.roleSession.userId ?? 0)
              )
            )
            .limit(1)
        )[0];
        if (existing) return { id: existing.id, alreadyCreated: true };
        if (
          ctx.roleSession.role === "operator" &&
          (!input.paperId || !input.intakeQrToken)
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Scan the registered paper QR before capturing an answer sheet.",
          });
        }
        const paperContext = input.paperId
          ? await requireExamPaper(db, input.paperId, input.intakeQrToken)
          : null;
        if (paperContext) {
          await requireSessionCenterAccess(
            db,
            ctx.roleSession.userId,
            paperContext.session
          );
        }
        const enrolledStudent =
          paperContext && input.candidateId && input.candidateDob
            ? (
                await db
                  .select()
                  .from(students)
                  .where(
                    and(
                      eq(students.candidateId, input.candidateId),
                      eq(students.dateOfBirth, input.candidateDob),
                      eq(students.examSessionId, paperContext.session.id)
                    )
                  )
                  .limit(1)
              )[0]
            : null;
        if (
          paperContext?.session.isDemo &&
          input.candidateId &&
          input.candidateDob
        ) {
          const sameName =
            enrolledStudent?.name.trim().toLocaleLowerCase("en-IN") ===
            input.candidateName?.trim().toLocaleLowerCase("en-IN");
          if (!enrolledStudent || !sameName)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                "Use an enrolled demonstration student identity for this paper QR.",
            });
        }
        const decoded = decodeImageDataUrl(input.image);
        const id = nanoid(16);
        const stored = await storagePut(
          `drishti/${id}/capture-${input.source}.${decoded.mimeType === "image/png" ? "png" : "jpg"}`,
          decoded.bytes,
          decoded.mimeType
        );
        await db.insert(bundles).values({
          id,
          candidateName: input.candidateName ?? "Pending identity extraction",
          candidateId: input.candidateId ?? null,
          candidateDob: input.candidateDob ?? null,
          studentId: enrolledStudent?.id ?? null,
          schoolId: enrolledStudent?.schoolId ?? null,
          isDemo: paperContext?.paper.isDemo ?? false,
          subject: paperContext?.paper.subject ?? input.subject,
          examPaperId: paperContext?.paper.id ?? null,
          intakeQrToken: paperContext?.paper.qrToken ?? null,
          schemeId: paperContext?.paper.schemeId ?? null,
          pageCount: 1,
          bookletKey: stored.key,
          bookletUrl: stored.url,
          createdByRole: ctx.roleSession.role,
          createdByUserId: ctx.roleSession.userId ?? null,
          idempotencyKey: input.idempotencyKey,
          captureSource: input.source,
          captureDevice: input.device ?? null,
          processingState: "saved",
        });
        await db.insert(documents).values({
          id: nanoid(16),
          bundleId: id,
          artifactType: "answerBooklet",
          fileName: `capture-${input.source}.${decoded.mimeType === "image/png" ? "png" : "jpg"}`,
          mimeType: decoded.mimeType,
          storageKey: stored.key,
          storageUrl: stored.url,
          pageNumber: 1,
        });
        await db.insert(pageChecks).values({
          id: nanoid(16),
          bundleId: id,
          pageNumber: 1,
          clarity: input.clarity,
          laplacianVariance: input.laplacianVariance,
          reason: input.reason,
          pageDataUrl: input.image,
        });
        await audit(
          id,
          ctx.roleSession.role,
          "bundle.captured",
          `${input.source} image captured and stored.`
        );
        return { id, alreadyCreated: false };
      }),
    appendCapture: withRoles("operator", "admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          image: z.string().min(32).max(14_000_000),
          clarity: z.enum(["CLEAR", "BLURRY"]),
          laplacianVariance: z.number().int().nonnegative(),
          reason: z.string().trim().min(1).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        if (
          bundle.processingState !== "saved" &&
          bundle.processingState !== "captured"
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This capture has already been submitted.",
          });
        }
        const decoded = decodeImageDataUrl(input.image);
        const pageNumber = bundle.pageCount + 1;
        const stored = await storagePut(
          `drishti/${input.bundleId}/capture-page-${pageNumber}.${decoded.mimeType === "image/png" ? "png" : "jpg"}`,
          decoded.bytes,
          decoded.mimeType
        );
        await db.insert(documents).values({
          id: nanoid(16),
          bundleId: input.bundleId,
          artifactType: "answerBooklet",
          fileName: `capture-page-${pageNumber}.${decoded.mimeType === "image/png" ? "png" : "jpg"}`,
          mimeType: decoded.mimeType,
          storageKey: stored.key,
          storageUrl: stored.url,
          pageNumber,
        });
        await db.insert(pageChecks).values({
          id: nanoid(16),
          bundleId: input.bundleId,
          pageNumber,
          clarity: input.clarity,
          laplacianVariance: input.laplacianVariance,
          reason: input.reason,
          pageDataUrl: input.image,
        });
        await db
          .update(bundles)
          .set({ pageCount: pageNumber })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "bundle.page_captured",
          `Page ${pageNumber} captured and stored.`
        );
        return { bundleId: input.bundleId, pageNumber };
      }),
    submitCapture: withRoles("operator", "admin")
      .input(z.object({ bundleId: bundleIdInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundle(db, input.bundleId);
        if (
          ctx.roleSession.role === "operator" &&
          bundle.createdByUserId !== ctx.roleSession.userId
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This capture does not belong to your desk.",
          });
        }
        if (
          bundle.processingState !== "saved" &&
          bundle.processingState !== "captured"
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This paper is already submitted for evaluation.",
          });
        }
        await db
          .update(bundles)
          .set({ processingState: "ready_for_evaluation" })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "bundle.submitted",
          "Capture submitted for evaluation."
        );
        return {
          id: input.bundleId,
          processingState: "ready_for_evaluation" as const,
        };
      }),
    create: withRoles("admin")
      .input(
        z
          .object({
            candidateName: z.string().trim().min(2).max(160),
            subject: z.string().trim().min(2).max(160),
            examPaperId: z.string().trim().min(1).optional(),
            intakeQrToken: z.string().trim().min(10).optional(),
            schemeId: bundleIdInput.optional(),
            printedMaximumMarks: z.number().int().positive().optional(),
            operatorConfirmedTotal: z.number().int().positive().optional(),
            catalogTotal: z.number().int().positive().default(80),
            questionPaper: fileInput,
            booklet: fileInput,
            pages: z.array(pageInput).min(1).max(500),
          })
          .superRefine((value, ctx) => {
            const seen = new Set<number>();
            for (const page of value.pages) {
              if (seen.has(page.pageNumber))
                ctx.addIssue({
                  code: "custom",
                  path: ["pages"],
                  message: `Page ${page.pageNumber} appears more than once.`,
                });
              seen.add(page.pageNumber);
            }
          })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const id = nanoid(16);
        if (input.examPaperId)
          await requireExamPaper(db, input.examPaperId, input.intakeQrToken);
        if (input.schemeId) {
          const scheme = (
            await db
              .select()
              .from(markingSchemes)
              .where(eq(markingSchemes.id, input.schemeId))
              .limit(1)
          )[0];
          if (!scheme)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "The selected marking setup no longer exists.",
            });
        }
        const questionPaper = decodePdfUpload(input.questionPaper);
        const answerBooklet = decodePdfUpload(input.booklet);
        input.pages.forEach(page => {
          if (page.pageDataUrl) decodeImageDataUrl(page.pageDataUrl);
        });
        const storedKeys: string[] = [];
        try {
          const paper = await storagePut(
            `drishti/${id}/question-paper-${questionPaper.fileName}`,
            questionPaper.bytes,
            questionPaper.mimeType
          );
          storedKeys.push(paper.key);
          const booklet = await storagePut(
            `drishti/${id}/answer-booklet-${answerBooklet.fileName}`,
            answerBooklet.bytes,
            answerBooklet.mimeType
          );
          storedKeys.push(booklet.key);
          await db.insert(bundles).values({
            id,
            candidateName: input.candidateName,
            subject: input.subject,
            examPaperId: input.examPaperId ?? null,
            intakeQrToken: input.intakeQrToken ?? null,
            schemeId: input.schemeId ?? null,
            printedMaximumMarks: input.printedMaximumMarks ?? null,
            operatorConfirmedTotal: input.operatorConfirmedTotal ?? null,
            catalogTotal: input.catalogTotal,
            coverageComplete: Boolean(
              input.printedMaximumMarks || input.operatorConfirmedTotal
            ),
            pageCount: input.pages.length,
            questionPaperKey: paper.key,
            questionPaperUrl: paper.url,
            bookletKey: booklet.key,
            bookletUrl: booklet.url,
            createdByRole: ctx.roleSession.role,
          });
          await db.insert(documents).values(
            sourceArtifactRows(
              id,
              {
                fileName: questionPaper.fileName,
                mimeType: questionPaper.mimeType,
                storageKey: paper.key,
                storageUrl: paper.url,
              },
              {
                fileName: answerBooklet.fileName,
                mimeType: answerBooklet.mimeType,
                storageKey: booklet.key,
                storageUrl: booklet.url,
              }
            )
          );
          await db.insert(pageChecks).values(
            input.pages.map(page => ({
              id: nanoid(16),
              bundleId: id,
              ...page,
              pageDataUrl: page.pageDataUrl ?? null,
            }))
          );
          await audit(
            id,
            ctx.roleSession.role,
            "bundle.created",
            `Booklet intake created with ${input.pages.length} scanned pages.`
          );
          return { id };
        } catch (error) {
          await Promise.allSettled(storedKeys.map(storageDelete));
          throw error;
        }
      }),
    replacePage: withRoles("admin")
      .input(z.object({ bundleId: bundleIdInput, page: pageInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        await requireBundle(db, input.bundleId);
        const existing = await db
          .select()
          .from(pageChecks)
          .where(
            and(
              eq(pageChecks.bundleId, input.bundleId),
              eq(pageChecks.pageNumber, input.page.pageNumber)
            )
          );
        if (
          existing[0]?.clarity === "BLURRY" &&
          input.page.clarity === "CLEAR" &&
          !input.page.pageDataUrl
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A clear replacement image is required for a blurry page.",
          });
        }
        if (existing[0])
          await db
            .update(pageChecks)
            .set({ ...input.page, pageDataUrl: input.page.pageDataUrl ?? null })
            .where(eq(pageChecks.id, existing[0].id));
        else
          await db.insert(pageChecks).values({
            id: nanoid(16),
            bundleId: input.bundleId,
            ...input.page,
            pageDataUrl: input.page.pageDataUrl ?? null,
          });
        if (input.page.pageDataUrl) {
          const replacement = decodeImageDataUrl(input.page.pageDataUrl);
          const extension =
            replacement.mimeType === "image/png" ? "png" : "jpg";
          const fileName = `replacement-page-${input.page.pageNumber}.${extension}`;
          const image = await storagePut(
            `drishti/${input.bundleId}/${fileName}`,
            replacement.bytes,
            replacement.mimeType
          );
          await db
            .insert(documents)
            .values(
              replacementPageArtifact(
                input.bundleId,
                input.page.pageNumber,
                fileName,
                image.key,
                image.url,
                replacement.mimeType
              )
            );
        }
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "page.replaced",
          `Page ${input.page.pageNumber} was replaced and rechecked.`
        );
        return { success: true };
      }),
    finalize: withRoles("admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          finalPdf: fileInput,
          qrToken: z
            .string()
            .trim()
            .min(20)
            .max(160)
            .regex(
              /^[A-Za-z0-9_-]+$/,
              "qrToken contains unsupported characters"
            ),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        if (bundle.status === "finalized" && bundle.finalUrl) {
          if (bundle.qrToken === input.qrToken)
            return {
              url: bundle.finalUrl,
              verificationUrl: `/verify/${encodeURIComponent(input.qrToken)}`,
              alreadyFinalized: true,
            };
          throw new TRPCError({
            code: "CONFLICT",
            message: "This bundle is already finalized.",
          });
        }
        const checkedPages = await db
          .select()
          .from(pageChecks)
          .where(eq(pageChecks.bundleId, input.bundleId));
        if (checkedPages.some(page => page.clarity === "BLURRY")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Replace every blurry page before finalizing this bundle.",
          });
        }
        const finalPdf = decodePdfUpload(input.finalPdf);
        const final = await storagePut(
          `drishti/${input.bundleId}/final-${finalPdf.fileName}`,
          finalPdf.bytes,
          finalPdf.mimeType
        );
        await db
          .update(bundles)
          .set({
            finalKey: final.key,
            finalUrl: final.url,
            qrToken: input.qrToken,
            status: "finalized",
          })
          .where(eq(bundles.id, input.bundleId));
        await db
          .insert(documents)
          .values(
            finalPdfArtifact(
              input.bundleId,
              finalPdf.fileName,
              final.key,
              final.url
            )
          );
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "bundle.finalized",
          "Final PDF and verification token stored; bundle finalized for verification."
        );
        return {
          url: final.url,
          verificationUrl: `/verify/${encodeURIComponent(input.qrToken)}`,
          alreadyFinalized: false,
        };
      }),
    extractScheme: withRoles("admin")
      .input(z.object({ bundleId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Automatic question-paper extraction is disabled. Attach the published admin question set before grading.",
        });
        /* The historical document-transcription implementation below is unreachable. */
        const db = await database();
        const bundle = (
          await db
            .select()
            .from(bundles)
            .where(eq(bundles.id, input.bundleId))
            .limit(1)
        )[0];
        if (!bundle) throw new Error("Bundle not found.");
        const questionPaperKey = bundle.questionPaperKey ?? "";
        if (!questionPaperKey)
          throw new Error("This bundle has no stored question paper to read.");
        const pdfBytes = await storageGetBuffer(questionPaperKey);
        const extracted = await extractSchemeFromPdf({
          pdfBase64: pdfBytes.toString("base64"),
          filename: questionPaperKey,
        });
        const id = nanoid(16);
        const title =
          extracted.paperTitle || `${bundle.subject} · ${bundle.candidateName}`;
        await db.insert(markingSchemes).values({
          id,
          title,
          subject: bundle.subject,
          maximumMarks: extracted.maximumMarks,
          questions: extracted.questions,
          createdByRole: ctx.roleSession.role,
        });
        await db
          .update(bundles)
          .set({ schemeId: id })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "scheme.extracted",
          `AI extracted ${extracted.questionCount} questions (${extracted.maximumMarks} marks) directly from the stored question paper.`
        );
        return {
          schemeId: id,
          questionCount: extracted.questionCount,
          maximumMarks: extracted.maximumMarks,
        };
      }),
  }),
  annotations: router({
    create: withRoles("evaluator", "admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          questionId: z.string().trim().min(1).max(120),
          pageNumber: z.number().int().positive(),
          type: z.enum([
            "check",
            "cross",
            "circle",
            "underline",
            "highlight",
            "comment",
            "review",
            "mark",
          ]),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().min(0).max(1).default(0),
          height: z.number().min(0).max(1).default(0),
          content: z.string().trim().max(1_000).optional(),
          style: z
            .object({
              color: z.string().trim().max(32).optional(),
              source: z.literal("teacher").optional(),
              marks: halfMarkInput.optional(),
              maximumMarks: z.number().positive().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        requireEditableEvaluationBundle(bundle);
        if (!bundle.schemeId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Attach a marking setup before annotating this answer sheet.",
          });
        if (input.pageNumber > bundle.pageCount)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The selected annotation page is outside this answer booklet.",
          });
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, bundle.schemeId))
            .limit(1)
        )[0];
        const questions = Array.isArray(scheme?.questions)
          ? (scheme.questions as SchemeQuestion[])
          : [];
        const question = questions.find(
          question => question.id === input.questionId
        );
        if (!question)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This question is not part of the bundle's marking setup.",
          });
        if (input.type === "mark") {
          const marks = input.style?.marks;
          if (marks === undefined || marks > question.maximumMarks)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Use a valid teacher mark within the question maximum.",
            });
          const evaluationRows = await ensureQuestionEvaluations(
            db,
            bundle,
            questions
          );
          const evaluation = evaluationRows.find(
            row => row.questionId === question.id
          );
          if (!evaluation)
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Could not open the question evaluation record.",
            });
          const priorPages = Array.isArray(evaluation.pagesViewed)
            ? evaluation.pagesViewed.filter(
                (value): value is number => typeof value === "number"
              )
            : [];
          const pagesViewed = Array.from(
            new Set([...priorPages, input.pageNumber])
          ).sort((left, right) => left - right);
          await db
            .update(evaluations)
            .set({
              humanMarks: marks,
              pagesViewed,
              humanDecision:
                evaluation.aiMarks !== null && evaluation.aiMarks === marks
                  ? "accept"
                  : "modify",
              reviewedByRole: ctx.roleSession.role,
            })
            .where(eq(evaluations.id, evaluation.id));
          const scoreAnnotation = await upsertScoreAnnotation(db, {
            bundleId: input.bundleId,
            questionId: question.id,
            pageNumber: input.pageNumber,
            marks,
            maximumMarks: question.maximumMarks,
            source: "teacher",
            evaluationId: evaluation.id,
            createdByUserId: ctx.roleSession.userId ?? null,
            createdByRole: ctx.roleSession.role,
            annotationPosition: { x: input.x, y: input.y },
          });
          const annotation = (
            await db
              .select()
              .from(teacherAnnotations)
              .where(eq(teacherAnnotations.id, scoreAnnotation.annotationId))
              .limit(1)
          )[0];
          await audit(
            input.bundleId,
            ctx.roleSession.role,
            "marking.annotation_score_saved",
            `${question.id} saved with ${marks} / ${question.maximumMarks} from a teacher mark.`
          );
          return { annotation };
        }
        const annotation = {
          id: nanoid(16),
          ...input,
          content: input.content || null,
          style: input.style ?? null,
          createdByUserId: ctx.roleSession.userId ?? null,
          createdByRole: ctx.roleSession.role,
        };
        await db.insert(teacherAnnotations).values(annotation);
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          input.type === "comment"
            ? "annotation.comment_added"
            : input.type === "review"
              ? "annotation.review_flagged"
              : "annotation.created",
          `${input.type} annotation added for ${input.questionId} on page ${input.pageNumber}.`
        );
        return { annotation };
      }),
    delete: withRoles("evaluator", "admin")
      .input(z.object({ id: z.string().trim().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const annotation = (
          await db
            .select()
            .from(teacherAnnotations)
            .where(eq(teacherAnnotations.id, input.id))
            .limit(1)
        )[0];
        if (!annotation)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This annotation no longer exists.",
          });
        await requireBundleAccess(
          db,
          annotation.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        const bundle = await requireBundle(db, annotation.bundleId);
        requireEditableEvaluationBundle(bundle);
        await db
          .delete(teacherAnnotations)
          .where(eq(teacherAnnotations.id, annotation.id));
        await audit(
          annotation.bundleId,
          ctx.roleSession.role,
          "annotation.deleted",
          `${annotation.type} annotation removed from ${annotation.questionId} on page ${annotation.pageNumber}.`
        );
        return { annotation };
      }),
  }),
  marking: router({
    open: withRoles("evaluator", "admin")
      .input(z.object({ bundleId: bundleIdInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        if (bundle.schemeId) {
          const scheme = (
            await db
              .select()
              .from(markingSchemes)
              .where(eq(markingSchemes.id, bundle.schemeId))
              .limit(1)
          )[0];
          const questions = Array.isArray(scheme?.questions)
            ? (scheme.questions as SchemeQuestion[])
            : [];
          await ensureQuestionEvaluations(db, bundle, questions);
        }
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "checking.started",
          "Evaluator opened the dedicated AI grading workspace."
        );
        return { opened: true };
      }),
    save: withRoles("evaluator", "admin")
      .input(
        z.object({
          id: z.string().optional(),
          bundleId: z.string(),
          questionId: z.string(),
          questionLabel: z.string(),
          schemeMaximum: z.number().int().nonnegative(),
          humanMarks: halfMarkInput.nullable(),
          pagesViewed: z.array(z.number().int().positive()),
          humanDecision: z
            .enum(["accept", "modify", "override", "review"])
            .optional(),
          decisionReason: z.string().trim().max(1000).optional(),
          teacherComment: z.string().trim().max(2000).optional(),
          markAnnotation: z
            .object({
              pageNumber: z.number().int().positive(),
              x: z.number().min(0).max(1),
              y: z.number().min(0).max(1),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        requireEditableEvaluationBundle(bundle);
        if (!bundle.schemeId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Attach a marking setup before saving marks.",
          });
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, bundle.schemeId))
            .limit(1)
        )[0];
        if (!scheme)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The attached marking setup no longer exists.",
          });
        const questions = Array.isArray(scheme.questions)
          ? (scheme.questions as SchemeQuestion[])
          : [];
        const question = questions.find(item => item.id === input.questionId);
        if (!question)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This question is not part of the bundle's marking setup.",
          });
        const humanMarks =
          input.humanMarks === null
            ? null
            : Math.min(input.humanMarks, question.maximumMarks);
        await ensureQuestionEvaluations(db, bundle, questions);
        const existing = input.id
          ? (
              await db
                .select()
                .from(evaluations)
                .where(eq(evaluations.id, input.id))
                .limit(1)
            )[0]
          : (
              await db
                .select()
                .from(evaluations)
                .where(
                  and(
                    eq(evaluations.bundleId, input.bundleId),
                    eq(evaluations.questionId, input.questionId)
                  )
                )
                .limit(1)
            )[0];
        const id = existing?.id ?? nanoid(16);
        if (
          existing &&
          (existing.bundleId !== input.bundleId ||
            existing.questionId !== input.questionId)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The evaluation record belongs to a different bundle or question.",
          });
        }
        const priorPages = Array.isArray(existing?.pagesViewed)
          ? existing.pagesViewed.filter(
              (value): value is number => typeof value === "number"
            )
          : [];
        const pagesViewed = Array.from(
          new Set([...priorPages, ...input.pagesViewed])
        ).sort((a, b) => a - b);
        await db
          .insert(evaluations)
          .values({
            id,
            bundleId: input.bundleId,
            questionId: input.questionId,
            questionLabel: question.label,
            schemeMaximum: question.maximumMarks,
            humanMarks,
            pagesViewed,
            aiMarks: existing?.aiMarks ?? null,
            feedback: existing?.feedback ?? null,
            confidence: existing?.confidence ?? null,
            aiOutput: existing?.aiOutput ?? null,
            aiProvider: existing?.aiProvider ?? null,
            aiModel: existing?.aiModel ?? null,
            aiEvaluatedAt: existing?.aiEvaluatedAt ?? null,
            promptVersion: existing?.promptVersion ?? null,
            rubricVersion: existing?.rubricVersion ?? null,
            evaluationVersion: existing?.evaluationVersion ?? 1,
            requiresHumanReview: existing?.requiresHumanReview ?? false,
            humanDecision:
              input.humanDecision ?? existing?.humanDecision ?? null,
            decisionReason:
              input.decisionReason ?? existing?.decisionReason ?? null,
            teacherComment:
              input.teacherComment ?? existing?.teacherComment ?? null,
            reviewedByRole: ctx.roleSession.role,
          })
          .onConflictDoUpdate({
            target: evaluations.id,
            set: {
              humanMarks,
              pagesViewed,
              humanDecision:
                input.humanDecision ?? existing?.humanDecision ?? null,
              decisionReason:
                input.decisionReason ?? existing?.decisionReason ?? null,
              teacherComment:
                input.teacherComment ?? existing?.teacherComment ?? null,
              reviewedByRole: ctx.roleSession.role,
            },
          });
        if (humanMarks !== null) {
          const pageNumber = Math.max(
            1,
            Math.min(
              bundle.pageCount,
              input.markAnnotation?.pageNumber ?? pagesViewed.at(-1) ?? 1
            )
          );
          await upsertScoreAnnotation(db, {
            bundleId: input.bundleId,
            questionId: question.id,
            pageNumber,
            marks: humanMarks,
            maximumMarks: question.maximumMarks,
            source: "teacher",
            evaluationId: id,
            createdByUserId: ctx.roleSession.userId ?? null,
            createdByRole: ctx.roleSession.role,
            annotationPosition: input.markAnnotation
              ? { x: input.markAnnotation.x, y: input.markAnnotation.y }
              : null,
          });
        }
        const aiMarks = existing?.aiMarks ?? null;
        if (
          humanMarks !== null &&
          aiMarks !== null &&
          Math.abs(humanMarks - aiMarks) >= 3
        ) {
          const opened = await db
            .select()
            .from(deviations)
            .where(
              and(
                eq(deviations.evaluationId, id),
                eq(deviations.status, "open")
              )
            );
          if (!opened[0])
            await db.insert(deviations).values({
              id: nanoid(16),
              bundleId: input.bundleId,
              evaluationId: id,
              delta: Math.abs(humanMarks - aiMarks),
            });
        }
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          input.humanDecision
            ? `marking.${input.humanDecision}`
            : "marking.saved",
          `${input.questionId} saved with ${humanMarks ?? "no"} / ${question.maximumMarks} human marks${input.humanDecision ? ` (${input.humanDecision})` : ""}.`
        );
        return { id, humanMarks };
      }),
    submit: withRoles("evaluator", "admin")
      .input(z.object({ bundleId: bundleIdInput }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        if (!bundle.schemeId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A marking setup is required before submission.",
          });
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, bundle.schemeId))
            .limit(1)
        )[0];
        const questions = Array.isArray(scheme?.questions)
          ? (scheme.questions as SchemeQuestion[])
          : [];
        const rows = await db
          .select()
          .from(evaluations)
          .where(eq(evaluations.bundleId, input.bundleId));
        const evaluationByQuestion = new Map(
          rows.map(row => [row.questionId, row])
        );
        const missingQuestions = questions.filter(question => {
          const row = evaluationByQuestion.get(question.id);
          return !row || row.humanMarks === null;
        });
        const invalidQuestions = questions.filter(question => {
          const row = evaluationByQuestion.get(question.id);
          return (
            !row ||
            typeof row.humanMarks !== "number" ||
            row.humanMarks < 0 ||
            row.humanMarks > question.maximumMarks
          );
        });
        const reviewQuestions = questions.filter(
          question =>
            evaluationByQuestion.get(question.id)?.humanDecision === "review"
        );
        if (!questions.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "A marking setup with at least one question is required before finalizing.",
          });
        }
        if (missingQuestions.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${missingQuestions.length} question${missingQuestions.length === 1 ? "" : "s"} still need a final mark.`,
          });
        }
        if (reviewQuestions.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Resolve the remaining review items before finalizing.",
          });
        }
        if (invalidQuestions.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "One or more saved marks are outside the configured question maximum.",
          });
        }
        const finalScore = questions.reduce(
          (total, question) =>
            total + (evaluationByQuestion.get(question.id)?.humanMarks ?? 0),
          0
        );
        const maximumMarks = questions.reduce(
          (total, question) => total + question.maximumMarks,
          0
        );
        if (
          bundle.status === "finalized" &&
          bundle.processingState === "completed"
        ) {
          return {
            success: true,
            alreadyFinalized: true,
            nextState: "completed" as const,
            finalScore,
            maximumMarks,
          };
        }
        await db
          .update(bundles)
          .set({ status: "finalized", processingState: "completed" })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "marking.finalized",
          `Evaluator finalized the paper at ${finalScore} / ${maximumMarks}.`
        );
        return {
          success: true,
          alreadyFinalized: false,
          nextState: "completed" as const,
          finalScore,
          maximumMarks,
        };
      }),
    aiGrade: withRoles("evaluator", "admin")
      .input(
        z.object({
          bundleId: z.string(),
          secondReader: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Bulk AI grading is disabled. Prepare and evaluate each official question so AI can map the exact answer evidence.",
        });
      }),
    startOcr: withRoles("evaluator", "admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          questionId: z.string().trim().min(1).max(120),
          language: z.string().trim().min(2).max(20).default("en-IN"),
          force: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        requireEditableEvaluationBundle(bundle);
        if (!bundle.schemeId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "A published question setup is required before preparing answer evidence.",
          });
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, bundle.schemeId))
            .limit(1)
        )[0];
        const questions = Array.isArray(scheme?.questions)
          ? (scheme.questions as SchemeQuestion[])
          : [];
        const question = questions.find(item => item.id === input.questionId);
        if (!question)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This question is not in the attached marking scheme.",
          });
        return prepareOpenRouterEvidence({
          db,
          bundle,
          question,
          language: input.language,
          role: ctx.roleSession.role,
          force: input.force,
        });
      }),
    pollOcr: withRoles("evaluator", "admin")
      .input(z.object({ extractionId: z.string().trim().min(1).max(120) }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const extraction = (
          await db
            .select()
            .from(answerExtractions)
            .where(eq(answerExtractions.id, input.extractionId))
            .limit(1)
        )[0];
        if (!extraction)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Answer-evidence record not found.",
          });
        await requireBundleAccess(
          db,
          extraction.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        return {
          status: extraction.status,
          terminal:
            extraction.status === "completed" || extraction.status === "failed",
        };
      }),
    aiGradeQuestion: withRoles("evaluator", "admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          questionId: z.string().trim().min(1).max(120),
          force: z.boolean().default(false),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        requireEditableEvaluationBundle(bundle);
        if (!bundle.schemeId)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "A marking setup is required before AI evaluation.",
          });
        const scheme = (
          await db
            .select()
            .from(markingSchemes)
            .where(eq(markingSchemes.id, bundle.schemeId))
            .limit(1)
        )[0];
        const questions = Array.isArray(scheme?.questions)
          ? (scheme.questions as SchemeQuestion[])
          : [];
        const question = questions.find(item => item.id === input.questionId);
        if (!question)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This question is not in the attached marking scheme.",
          });
        await ensureQuestionEvaluations(db, bundle, questions);
        const existing = (
          await db
            .select()
            .from(evaluations)
            .where(
              and(
                eq(evaluations.bundleId, input.bundleId),
                eq(evaluations.questionId, question.id)
              )
            )
            .limit(1)
        )[0];
        let extraction = (
          await db
            .select()
            .from(answerExtractions)
            .where(
              and(
                eq(answerExtractions.bundleId, input.bundleId),
                eq(answerExtractions.questionId, question.id),
                eq(answerExtractions.status, "completed")
              )
            )
            .orderBy(desc(answerExtractions.updatedAt))
            .limit(1)
        )[0];
        if (!extraction) {
          const prepared = await prepareOpenRouterEvidence({
            db,
            bundle,
            question,
            language: "en-IN",
            role: ctx.roleSession.role,
          });
          extraction = (
            await db
              .select()
              .from(answerExtractions)
              .where(eq(answerExtractions.id, prepared.extractionId))
              .limit(1)
          )[0];
        }
        if (!extraction)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "AI evaluation could not be completed. Retry or continue with manual grading.",
          });
        const evidenceVersion = `${extraction.id}:${extraction.updatedAt.getTime()}:${extraction.confidence}`;
        const cacheKey = `${OPENROUTER_GRADING_PROMPT_VERSION}:${OPENROUTER_GRADING_MODEL}:${input.bundleId}:${question.id}:${questionSetVersion(bundle.schemeId)}:${evidenceVersion}`;
        const priorOutput = existing?.aiOutput;
        const priorCacheKey =
          priorOutput &&
          typeof priorOutput === "object" &&
          !Array.isArray(priorOutput)
            ? (priorOutput as { cacheKey?: unknown }).cacheKey
            : undefined;
        if (
          existing?.aiMarks !== null &&
          existing?.aiMarks !== undefined &&
          existing.aiProvider === "openrouter" &&
          priorCacheKey === cacheKey &&
          !input.force
        )
          return {
            cached: true,
            evaluationId: existing.id,
            grade: existing.aiOutput,
          };
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "ai_evaluation.started",
          `AI evaluation started for ${question.id}.`
        );
        const answerPages = await storedAnswerPages(db, bundle);
        const selectedPage = answerPages.find(
          page => page.pageNumber === (extraction.pageNumber ?? 1)
        );
        const answerRegion = answerRegionFrom(extraction.answerRegion);
        const mappingConfidence =
          extraction.answerRegion &&
          typeof extraction.answerRegion === "object" &&
          !Array.isArray(extraction.answerRegion)
            ? (extraction.answerRegion as { mappingConfidence?: unknown })
                .mappingConfidence
            : undefined;
        const generationId = nanoid(16);
        const config = getOpenRouterGradingConfig();
        await db.insert(generations).values({
          id: generationId,
          bundleId: bundle.id,
          provider: "openrouter",
          model: config.model,
          status: "queued",
          output: {
            stage: "applying-rubric",
            questionId: question.id,
            promptVersion: OPENROUTER_GRADING_PROMPT_VERSION,
          },
        });
        let result;
        try {
          result = await evaluateAnswer({
            question,
            answer: extraction.structuredText,
            extractionConfidence: extraction.confidence,
            language: extraction.language,
            pageImageDataUrl: selectedPage?.dataUrl,
            mappingConfidence:
              typeof mappingConfidence === "number"
                ? mappingConfidence
                : extraction.confidence,
          });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "AI evaluation could not be completed. Retry or continue with manual grading.";
          await db
            .update(generations)
            .set({
              status: "failed",
              output: {
                stage: "evaluation-failed",
                questionId: question.id,
                message,
              },
            })
            .where(eq(generations.id, generationId));
          await audit(
            input.bundleId,
            ctx.roleSession.role,
            "ai_evaluation.failed",
            `AI evaluation failed for ${question.id}.`
          );
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message,
          });
        }
        const mappingRequiresHumanReview = Boolean(
          extraction.answerRegion &&
            typeof extraction.answerRegion === "object" &&
            !Array.isArray(extraction.answerRegion) &&
            (extraction.answerRegion as { requiresHumanReview?: unknown })
              .requiresHumanReview
        );
        const grade = {
          ...result.grade,
          requiresHumanReview:
            result.grade.requiresHumanReview ||
            mappingRequiresHumanReview ||
            extraction.confidence < 70,
        };
        const suggestedScore = grade.suggestedScore;
        if (suggestedScore === undefined)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "AI evaluation could not be completed. Retry or continue with manual grading.",
          });
        const id = existing?.id ?? nanoid(16);
        await db
          .insert(evaluations)
          .values({
            id,
            bundleId: input.bundleId,
            questionId: question.id,
            questionLabel: question.label,
            schemeMaximum: question.maximumMarks,
            aiMarks: suggestedScore,
            humanMarks: existing?.humanMarks ?? null,
            feedback: grade.reason,
            confidence: grade.gradingConfidence,
            aiOutput: {
              ...grade,
              cacheKey,
              answerEvidenceId: extraction.id,
              answerEvidenceVersion: evidenceVersion,
              questionSetVersion: questionSetVersion(bundle.schemeId),
              responseAttempts: result.attempts,
            },
            aiProvider: result.provider,
            aiModel: result.model,
            aiEvaluatedAt: new Date(),
            promptVersion: OPENROUTER_GRADING_PROMPT_VERSION,
            rubricVersion: questionSetVersion(bundle.schemeId),
            evaluationVersion: (existing?.evaluationVersion ?? 0) + 1,
            requiresHumanReview: grade.requiresHumanReview,
            humanDecision: existing?.humanDecision ?? null,
            decisionReason: existing?.decisionReason ?? null,
            teacherComment: existing?.teacherComment ?? null,
            pagesViewed: existing?.pagesViewed ?? [],
            reviewedByRole: existing?.reviewedByRole ?? null,
          })
          .onConflictDoUpdate({
            target: evaluations.id,
            set: {
              aiMarks: suggestedScore,
              feedback: grade.reason,
              confidence: grade.gradingConfidence,
              aiOutput: {
                ...grade,
                cacheKey,
                answerEvidenceId: extraction.id,
                answerEvidenceVersion: evidenceVersion,
                questionSetVersion: questionSetVersion(bundle.schemeId),
                responseAttempts: result.attempts,
              },
              aiProvider: result.provider,
              aiModel: result.model,
              aiEvaluatedAt: new Date(),
              promptVersion: OPENROUTER_GRADING_PROMPT_VERSION,
              rubricVersion: questionSetVersion(bundle.schemeId),
              evaluationVersion: (existing?.evaluationVersion ?? 0) + 1,
              requiresHumanReview: grade.requiresHumanReview,
            },
          });
        await upsertScoreAnnotation(db, {
          bundleId: input.bundleId,
          questionId: question.id,
          pageNumber: Math.max(
            1,
            Math.min(bundle.pageCount, extraction.pageNumber ?? 1)
          ),
          marks: suggestedScore,
          maximumMarks: question.maximumMarks,
          source: "ai",
          evaluationId: id,
          createdByUserId: null,
          createdByRole: "system",
          answerRegion,
        });
        await upsertAiDecisionAnnotation(db, {
          bundleId: input.bundleId,
          questionId: question.id,
          pageNumber: Math.max(
            1,
            Math.min(bundle.pageCount, extraction.pageNumber ?? 1)
          ),
          marks: suggestedScore,
          maximumMarks: question.maximumMarks,
          evaluationId: id,
          requiresHumanReview: grade.requiresHumanReview,
          answerRegion,
        });
        await flagPossibleModelScoreBias(db, {
          bundleId: input.bundleId,
          questionId: question.id,
          marks: suggestedScore,
        });
        await db
          .update(generations)
          .set({
            status: "completed",
            model: result.model,
            attempt: result.attempts,
            output: {
              stage: "ready-for-review",
              questionId: question.id,
              suggestedScore,
              maximumScore: question.maximumMarks,
              requiresHumanReview: grade.requiresHumanReview,
              evaluationVersion: (existing?.evaluationVersion ?? 0) + 1,
              answerEvidenceId: extraction.id,
              provider: result.provider,
              model: result.model,
              grade,
            },
          })
          .where(eq(generations.id, generationId));
        await db
          .update(bundles)
          .set({ status: "review", processingState: "grading" })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          "ai_evaluation.completed",
          `AI evaluation completed for ${question.id}: ${suggestedScore} / ${question.maximumMarks} using ${result.provider}.`
        );
        return {
          cached: false,
          evaluationId: id,
          grade,
          provider: result.provider,
          model: result.model,
        };
      }),
  }),
  deviations: router({
    list: withRoles("admin").query(async () =>
      (await database())
        .select()
        .from(deviations)
        .orderBy(desc(deviations.createdAt))
    ),
    get: withRoles("admin")
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const row = (
          await db
            .select()
            .from(deviations)
            .where(eq(deviations.id, input.id))
            .limit(1)
        )[0];
        if (!row)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Re-check case not found.",
          });
        await requireBundleAccess(
          db,
          row.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        const [bundle, evaluation] = await Promise.all([
          requireBundle(db, row.bundleId),
          db
            .select()
            .from(evaluations)
            .where(eq(evaluations.id, row.evaluationId))
            .limit(1),
        ]);
        const scheme = bundle.schemeId
          ? (
              await db
                .select()
                .from(markingSchemes)
                .where(eq(markingSchemes.id, bundle.schemeId))
                .limit(1)
            )[0]
          : null;
        const question = Array.isArray(scheme?.questions)
          ? (scheme.questions as SchemeQuestion[]).find(
              item => item.id === evaluation[0]?.questionId
            )
          : null;
        return {
          row,
          bundle,
          evaluation: evaluation[0] ?? null,
          question: question ?? null,
        };
      }),
    submitRecheck: withRoles("admin")
      .input(
        z.object({
          id: z.string(),
          marks: halfMarkInput,
          note: z.string().trim().min(2).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const row = (
          await db
            .select()
            .from(deviations)
            .where(eq(deviations.id, input.id))
            .limit(1)
        )[0];
        if (!row)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Re-check case not found.",
          });
        await requireBundleAccess(
          db,
          row.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        const evaluation = (
          await db
            .select()
            .from(evaluations)
            .where(eq(evaluations.id, row.evaluationId))
            .limit(1)
        )[0];
        if (!evaluation || input.marks > evaluation.schemeMaximum)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The re-check mark must be within the question maximum.",
          });
        await db
          .update(deviations)
          .set({
            status: "reevaluate",
            recheckMarks: input.marks,
            recheckNote: input.note,
            recheckedByUserId: ctx.roleSession.userId ?? null,
            recheckedAt: new Date(),
            resolutionNote: input.note,
          })
          .where(eq(deviations.id, input.id));
        await audit(
          row.bundleId,
          ctx.roleSession.role,
          "recheck.submitted",
          `Re-check submitted for ${evaluation.questionId}.`
        );
        return { success: true };
      }),
    resolve: withRoles("admin")
      .input(
        z.object({
          id: z.string(),
          status: z.enum(["upheld", "reevaluate"]),
          note: z.string().min(2),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const row = (
          await db
            .select()
            .from(deviations)
            .where(eq(deviations.id, input.id))
            .limit(1)
        )[0];
        if (!row) throw new Error("Deviation not found.");
        await db
          .update(deviations)
          .set({
            status: input.status,
            resolutionNote: input.note,
            resolvedByRole: ctx.roleSession.role,
            resolvedAt: new Date(),
          })
          .where(eq(deviations.id, input.id));
        await audit(
          row.bundleId,
          ctx.roleSession.role,
          `deviation.${input.status}`,
          input.note
        );
        return { success: true };
      }),
  }),
  student: router({
    workspace: withRoles("student").query(async ({ ctx }) => {
      const db = await database();
      if (!ctx.roleSession.userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Student identity is required.",
        });
      const student = (
        await db
          .select()
          .from(students)
          .where(eq(students.userId, ctx.roleSession.userId))
          .limit(1)
      )[0];
      if (!student)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account is not linked to a student record.",
        });
      const studentBundles = await db
        .select()
        .from(bundles)
        .where(eq(bundles.studentId, student.id))
        .orderBy(desc(bundles.updatedAt));
      const requestRows = studentBundles.length
        ? await db
            .select()
            .from(recheckRequests)
            .where(
              inArray(
                recheckRequests.bundleId,
                studentBundles.map(bundle => bundle.id)
              )
            )
            .orderBy(desc(recheckRequests.updatedAt))
        : [];
      return { student, bundles: studentBundles, recheckRequests: requestRows };
    }),
  }),
  recheckRequests: router({
    create: publicProcedure
      .input(
        z.object({
          verificationToken: z.string().trim().min(10).max(160),
          studentName: z.string().trim().min(2).max(160),
          candidateId: z.string().trim().min(2).max(80),
          dateOfBirth: z.string().date(),
          reason: z.string().trim().min(10).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const signedInStudent =
          ctx.roleSession?.role === "student"
            ? (
                await db
                  .select()
                  .from(students)
                  .where(eq(students.userId, ctx.roleSession.userId ?? -1))
                  .limit(1)
              )[0]
            : null;
        if (ctx.roleSession?.role === "student") {
          if (!signedInStudent)
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "This account is not linked to a student record.",
            });
          if (
            signedInStudent.candidateId !== input.candidateId ||
            signedInStudent.dateOfBirth !== input.dateOfBirth ||
            signedInStudent.name.trim().toLocaleLowerCase("en-IN") !==
              input.studentName.trim().toLocaleLowerCase("en-IN")
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Use the identity associated with your student record.",
            });
        }
        const tokenMatches = await db
          .select()
          .from(bundles)
          .where(eq(bundles.qrToken, input.verificationToken));
        const normalize = (value: string | null) =>
          value?.trim().toLocaleLowerCase("en-IN") ?? "";
        const matches = tokenMatches.filter(
          row =>
            normalize(row.candidateName) === normalize(input.studentName) &&
            normalize(row.candidateId) === normalize(input.candidateId) &&
            row.candidateDob === input.dateOfBirth
        );
        if (matches.length > 1)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "IDENTITY_AMBIGUOUS: multiple finalized records match these details.",
          });
        const bundle = matches[0];
        if (!bundle || bundle.status !== "finalized") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Only a finalized Drishti result can receive a re-check request.",
          });
        }
        if (signedInStudent && bundle.studentId !== signedInStudent.id)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "This result is not associated with your student record.",
          });
        const { session } = await requireBundleSession(db, bundle);
        const recheckSession = await getRecheckSession(db, session.id);
        if (!recheckSession.open) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Re-checking is not currently open for this examination.",
          });
        }
        const duplicate = (
          await db
            .select()
            .from(recheckRequests)
            .where(
              and(
                eq(recheckRequests.bundleId, bundle.id),
                eq(recheckRequests.studentReference, input.candidateId)
              )
            )
            .limit(1)
        )[0];
        if (duplicate) return { id: duplicate.id, status: duplicate.status };
        const id = nanoid(16);
        await db.insert(recheckRequests).values({
          id,
          bundleId: bundle.id,
          studentReference: input.candidateId,
          reason: input.reason,
        });
        await audit(
          bundle.id,
          "student",
          "recheck.requested",
          `Student re-check request ${id} submitted.`
        );
        return { id, status: "requested" as const };
      }),
    list: withRoles("admin").query(async () =>
      (await database())
        .select()
        .from(recheckRequests)
        .orderBy(desc(recheckRequests.updatedAt))
    ),
    get: withRoles("admin")
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        const request = (
          await db
            .select()
            .from(recheckRequests)
            .where(eq(recheckRequests.id, input.id))
            .limit(1)
        )[0];
        if (!request)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Re-check request not found.",
          });
        const bundle = await requireBundle(db, request.bundleId);
        return { request, bundle };
      }),
    submit: withRoles("admin")
      .input(
        z.object({
          id: z.string(),
          status: z.enum(["resolved", "rejected"]),
          resolutionNote: z.string().trim().min(2).max(2000),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const request = (
          await db
            .select()
            .from(recheckRequests)
            .where(eq(recheckRequests.id, input.id))
            .limit(1)
        )[0];
        if (!request)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Re-check request not found.",
          });
        await db
          .update(recheckRequests)
          .set({ status: input.status, resolutionNote: input.resolutionNote })
          .where(eq(recheckRequests.id, input.id));
        await audit(
          request.bundleId,
          ctx.roleSession.role,
          `recheck.request.${input.status}`,
          input.resolutionNote
        );
        return { success: true };
      }),
  }),
  calibration: router({
    list: withRoles("admin").query(async () => {
      const rows = await (await database())
        .select()
        .from(clarityCalibrationSamples)
        .orderBy(desc(clarityCalibrationSamples.createdAt));
      return { rows, ...summarizeCalibration(rows) };
    }),
    record: withRoles("admin")
      .input(
        z.object({
          sourceLabel: z.string().min(2).max(160),
          expectedClarity: z.enum(["CLEAR", "BLURRY"]),
          observedClarity: z.enum(["CLEAR", "BLURRY"]),
          laplacianVariance: z.number().int().nonnegative(),
          reviewerNote: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const id = nanoid(16);
        await (await database()).insert(clarityCalibrationSamples).values({
          id,
          ...input,
          reviewerNote: input.reviewerNote ?? null,
          createdByRole: ctx.roleSession.role,
        });
        return { id };
      }),
  }),
  audit: router({
    list: roleProcedure
      .input(z.object({ bundleId: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = await database();
        await requireBundleAccess(
          db,
          input.bundleId,
          ctx.roleSession.role,
          ctx.roleSession.userId
        );
        return db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.bundleId, input.bundleId))
          .orderBy(desc(auditEvents.createdAt));
      }),
  }),
  admin: router({
    staff: router({
      list: withRoles("admin").query(async () => {
        const db = await database();
        const rows = await db
          .select()
          .from(users)
          .where(
            inArray(users.role, ["operator", "evaluator", "school_admin"])
          );
        return rows.map(user => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          centerName: user.centerName,
          schoolId: user.schoolId,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
        }));
      }),
      create: withRoles("admin")
        .input(
          z.object({
            name: z.string().trim().min(2).max(120),
            email: z.string().trim().email().max(160),
            role: z.enum(["operator", "evaluator", "school_admin"]),
            centerName: z.string().trim().min(2).max(160),
            schoolId: z.string().trim().min(1).max(128).optional(),
            subject: z.string().trim().min(2).max(120).optional(),
            temporaryPassword: z
              .string()
              .min(LOCAL_PASSWORD_MIN_LENGTH)
              .max(256),
          })
        )
        .mutation(async ({ ctx, input }) => {
          const db = await database();
          const email = input.email.toLowerCase();
          const domain =
            process.env.OFFICIAL_EMAIL_DOMAIN?.trim().toLowerCase();
          if (domain && !email.endsWith(`@${domain}`))
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Use an official @${domain} email address.`,
            });
          if (input.role === "evaluator" && !input.subject)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Evaluator subject is required.",
            });
          if (input.role === "school_admin") {
            if (!input.schoolId)
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "School Admin accounts require a school assignment.",
              });
            const school = (
              await db
                .select({ id: schools.id, centerName: schools.centerName })
                .from(schools)
                .where(eq(schools.id, input.schoolId))
                .limit(1)
            )[0];
            if (!school || !sameCenter(school.centerName, input.centerName)) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Choose a school registered to this center.",
              });
            }
          }
          try {
            const passwordHash = hashPassword(input.temporaryPassword);
            const inserted = await db
              .insert(users)
              .values({
                openId: `local:${nanoid(24)}`,
                loginId: email,
                email,
                name: input.name,
                role: input.role,
                centerName: input.centerName,
                schoolId: input.role === "school_admin" ? input.schoolId : null,
                passwordHash,
                loginMethod: "local-password",
                isActive: true,
                mustChangePassword: true,
              })
              .returning({ id: users.id });
            const userId = inserted[0].id;
            if (input.role === "evaluator")
              await db.insert(evaluatorProfiles).values({
                userId,
                subject: input.subject,
                centerName: input.centerName,
              });
            await audit(
              "system",
              ctx.roleSession.role,
              "USER_CREATED",
              `Staff user ${userId} created with role ${input.role}.`
            );
            return {
              id: userId,
              email,
              role: input.role,
              mustChangePassword: true,
            };
          } catch (error) {
            if (error instanceof TRPCError) throw error;
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message:
                error instanceof Error
                  ? error.message
                  : "Could not create the staff account.",
            });
          }
        }),
      setActive: withRoles("admin")
        .input(
          z.object({
            userId: z.number().int().positive(),
            isActive: z.boolean(),
          })
        )
        .mutation(async ({ ctx, input }) => {
          if (ctx.roleSession.userId === input.userId && !input.isActive)
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "You cannot disable your own account.",
            });
          const db = await database();
          const target = (
            await db
              .select()
              .from(users)
              .where(eq(users.id, input.userId))
              .limit(1)
          )[0];
          if (
            !target ||
            !["operator", "evaluator", "school_admin"].includes(target.role)
          )
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Staff account not found.",
            });
          await db
            .update(users)
            .set({ isActive: input.isActive })
            .where(eq(users.id, input.userId));
          await audit(
            "system",
            ctx.roleSession.role,
            input.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
            `Staff user ${input.userId} active state changed.`
          );
          return { success: true };
        }),
    }),
    workspace: router({
      schools: withRoles("admin").query(listWorkspaceSchools),
      school: withRoles("admin")
        .input(z.object({ id: z.string().trim().min(1).max(128) }))
        .query(async ({ input }) => {
          const school = await getWorkspaceSchool(input.id);
          if (!school)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "School not found in the current exam session.",
            });
          return school;
        }),
      evaluators: withRoles("admin").query(listWorkspaceEvaluators),
      evaluator: withRoles("admin")
        .input(z.object({ userId: z.number().int().positive() }))
        .query(async ({ input }) => {
          const evaluator = await getWorkspaceEvaluator(input.userId);
          if (!evaluator)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Evaluator not found in the current exam session.",
            });
          return evaluator;
        }),
      answerSheets: withRoles("admin")
        .input(
          z.object({
            view: z.enum([
              "all",
              "scanned",
              "assigned",
              "evaluated",
              "pending",
            ]),
            search: z.string().trim().max(120).optional(),
          })
        )
        .query(({ input }) =>
          listWorkspaceAnswerSheets(input.view, input.search)
        ),
    }),
    console: withRoles("admin").query(async () => {
      const db = await database();
      const [
        bundleRows,
        evaluationRows,
        eventRows,
        userRows,
        assignmentRows,
        recheckRows,
      ] = await Promise.all([
        db.select().from(bundles),
        db.select().from(evaluations),
        db.select().from(auditEvents),
        db.select().from(users),
        db.select().from(bundleAssignments),
        db.select().from(deviations),
      ]);
      return {
        bundles: bundleRows,
        evaluations: evaluationRows,
        auditEvents: eventRows,
        users: userRows.map(user => ({
          id: user.id,
          loginId: user.loginId,
          name: user.name,
          email: user.email,
          role: user.role,
        })),
        assignments: assignmentRows,
        rechecks: recheckRows,
        recheckRequests: await db
          .select()
          .from(recheckRequests)
          .orderBy(desc(recheckRequests.updatedAt)),
      };
    }),
    assignEvaluator: withRoles("admin")
      .input(
        z.object({
          bundleId: bundleIdInput,
          evaluatorUserId: z.number().int().positive(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundle(db, input.bundleId);
        if (!canAssignEvaluator(bundle)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Only a submitted scanner capture can be assigned to an evaluator.",
          });
        }
        const { session } = await requireBundleSession(db, bundle);
        await requireSessionCenterAccess(db, ctx.roleSession.userId, session);
        const evaluator = (
          await db
            .select()
            .from(users)
            .where(eq(users.id, input.evaluatorUserId))
            .limit(1)
        )[0];
        if (!evaluator || evaluator.role !== "evaluator")
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Choose a user with the evaluator role.",
          });
        if (!evaluator.isActive) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This evaluator account is inactive.",
          });
        }
        const profile = (
          await db
            .select()
            .from(evaluatorProfiles)
            .where(eq(evaluatorProfiles.userId, evaluator.id))
            .limit(1)
        )[0];
        if (
          profile?.centerName &&
          !sameCenter(profile.centerName, session.centerName)
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "This evaluator is not registered for the paper's exam center.",
          });
        }
        if (
          profile?.subject &&
          profile.subject.trim().localeCompare(bundle.subject.trim(), "en", {
            sensitivity: "accent",
          }) !== 0
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This evaluator is not registered for the paper's subject.",
          });
        }
        const existing = await db
          .select()
          .from(bundleAssignments)
          .where(eq(bundleAssignments.bundleId, input.bundleId));
        const alreadyAssigned =
          existing.length === 1 &&
          existing[0].evaluatorUserId === input.evaluatorUserId;
        const reassigned = existing.length > 0 && !alreadyAssigned;
        if (reassigned)
          await db
            .delete(bundleAssignments)
            .where(eq(bundleAssignments.bundleId, input.bundleId));
        if (!alreadyAssigned)
          await db.insert(bundleAssignments).values({
            id: nanoid(16),
            bundleId: input.bundleId,
            evaluatorUserId: input.evaluatorUserId,
            assignedByUserId: ctx.roleSession.userId ?? 0,
          });
        await db
          .update(bundles)
          .set({ processingState: "assigned" })
          .where(eq(bundles.id, input.bundleId));
        await audit(
          input.bundleId,
          ctx.roleSession.role,
          reassigned ? "evaluator.reassigned" : "evaluator.assigned",
          `Paper assigned to evaluator ${input.evaluatorUserId}.`
        );
        return { success: true, alreadyAssigned };
      }),
  }),
});

export type AppRouter = typeof appRouter;
