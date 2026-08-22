import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = sqliteTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email").unique(),
  loginMethod: text("loginMethod"),
  loginId: text("loginId").unique(),
  passwordHash: text("passwordHash"),
  phoneNumber: text("phoneNumber").unique(),
  centerName: text("centerName"),
  schoolId: text("schoolId"),
  isActive: integer("isActive", { mode: "boolean" }).default(true).notNull(),
  /** Marks controlled seeded identities so demo reset never targets live users. */
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  mustChangePassword: integer("mustChangePassword", { mode: "boolean" })
    .default(false)
    .notNull(),
  role: text("role", {
    enum: [
      "user",
      "operator",
      "evaluator",
      "student",
      "school_admin",
      "admin",
    ] as const,
  })
    .default("user")
    .notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  candidateName: text("candidateName").notNull(),
  candidateId: text("candidateId"),
  candidateDob: text("candidateDob"),
  studentId: text("studentId"),
  schoolId: text("schoolId"),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  subject: text("subject").notNull(),
  examPaperId: text("examPaperId"),
  intakeQrToken: text("intakeQrToken"),
  status: text("status", {
    enum: ["intake", "review", "grading", "moderation", "finalized"] as const,
  })
    .default("intake")
    .notNull(),
  questionPaperKey: text("questionPaperKey"),
  questionPaperUrl: text("questionPaperUrl"),
  bookletKey: text("bookletKey"),
  bookletUrl: text("bookletUrl"),
  finalKey: text("finalKey"),
  finalUrl: text("finalUrl"),
  pageCount: integer("pageCount").default(0).notNull(),
  printedMaximumMarks: integer("printedMaximumMarks"),
  operatorConfirmedTotal: integer("operatorConfirmedTotal"),
  catalogTotal: integer("catalogTotal").default(80).notNull(),
  coverageComplete: integer("coverageComplete", { mode: "boolean" })
    .default(false)
    .notNull(),
  schemeId: text("schemeId"),
  qrToken: text("qrToken"),
  createdByRole: text("createdByRole").notNull(),
  createdByUserId: integer("createdByUserId"),
  idempotencyKey: text("idempotencyKey"),
  captureSource: text("captureSource", {
    enum: ["pdf", "camera", "hardware", "image"] as const,
  })
    .default("pdf")
    .notNull(),
  captureDevice: text("captureDevice"),
  processingState: text("processingState", {
    enum: [
      "captured",
      "saved",
      "ready_for_evaluation",
      "assigned",
      "grading",
      "submitted",
      "recheck_required",
      "completed",
    ] as const,
  })
    .default("captured")
    .notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  artifactType: text("artifactType", {
    enum: [
      "questionPaper",
      "answerBooklet",
      "scanOriginal",
      "replacementPage",
      "finalPdf",
    ] as const,
  }).notNull(),
  fileName: text("fileName").notNull(),
  mimeType: text("mimeType").notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  pageNumber: integer("pageNumber"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const pageChecks = sqliteTable("pageChecks", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  pageNumber: integer("pageNumber").notNull(),
  clarity: text("clarity", { enum: ["CLEAR", "BLURRY"] as const }).notNull(),
  laplacianVariance: integer("laplacianVariance").notNull(),
  reason: text("reason").notNull(),
  pageDataUrl: text("pageDataUrl"),
  checkedAt: integer("checkedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const clarityCalibrationSamples = sqliteTable(
  "clarityCalibrationSamples",
  {
    id: text("id").primaryKey(),
    sourceLabel: text("sourceLabel").notNull(),
    expectedClarity: text("expectedClarity", {
      enum: ["CLEAR", "BLURRY"] as const,
    }).notNull(),
    observedClarity: text("observedClarity", {
      enum: ["CLEAR", "BLURRY"] as const,
    }).notNull(),
    laplacianVariance: integer("laplacianVariance").notNull(),
    reviewerNote: text("reviewerNote"),
    createdByRole: text("createdByRole").notNull(),
    createdAt: integer("createdAt", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  }
);

export const markingSchemes = sqliteTable("markingSchemes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  maximumMarks: integer("maximumMarks").notNull(),
  questions: text("questions", { mode: "json" }).notNull(),
  createdByRole: text("createdByRole").notNull(),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const evaluations = sqliteTable("evaluations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  questionId: text("questionId").notNull(),
  questionLabel: text("questionLabel").notNull(),
  schemeMaximum: integer("schemeMaximum").notNull(),
  humanMarks: real("humanMarks"),
  aiMarks: real("aiMarks"),
  feedback: text("feedback"),
  confidence: integer("confidence"),
  aiOutput: text("aiOutput", { mode: "json" }),
  aiProvider: text("aiProvider"),
  aiModel: text("aiModel"),
  aiEvaluatedAt: integer("aiEvaluatedAt", { mode: "timestamp" }),
  promptVersion: text("promptVersion"),
  rubricVersion: text("rubricVersion"),
  evaluationVersion: integer("evaluationVersion").default(1).notNull(),
  requiresHumanReview: integer("requiresHumanReview", { mode: "boolean" })
    .default(false)
    .notNull(),
  humanDecision: text("humanDecision", {
    enum: ["accept", "modify", "override", "review"] as const,
  }),
  decisionReason: text("decisionReason"),
  teacherComment: text("teacherComment"),
  pagesViewed: text("pagesViewed", { mode: "json" }),
  reviewedByRole: text("reviewedByRole"),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const answerExtractions = sqliteTable("answerExtractions", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  questionId: text("questionId").notNull(),
  pageNumber: integer("pageNumber"),
  rawText: text("rawText").notNull(),
  structuredText: text("structuredText").notNull(),
  language: text("language").notNull(),
  confidence: integer("confidence").notNull(),
  answerRegion: text("answerRegion", { mode: "json" }),
  status: text("status", {
    enum: ["queued", "processing", "completed", "failed"] as const,
  })
    .default("queued")
    .notNull(),
  provider: text("provider").notNull(),
  externalJobId: text("externalJobId"),
  error: text("error"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

/**
 * Teacher-created review marks. Coordinates are normalized against the rendered
 * answer page so annotations remain correctly positioned at every zoom level.
 */
export const teacherAnnotations = sqliteTable("teacherAnnotations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  questionId: text("questionId").notNull(),
  pageNumber: integer("pageNumber").notNull(),
  type: text("type", {
    enum: [
      "check",
      "cross",
      "circle",
      "underline",
      "highlight",
      "comment",
      "review",
      "mark",
    ] as const,
  }).notNull(),
  x: real("x").notNull(),
  y: real("y").notNull(),
  width: real("width").notNull().default(0),
  height: real("height").notNull().default(0),
  content: text("content"),
  style: text("style", { mode: "json" }),
  createdByUserId: integer("createdByUserId"),
  createdByRole: text("createdByRole").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const deviations = sqliteTable("deviations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  evaluationId: text("evaluationId").notNull(),
  delta: real("delta").notNull(),
  status: text("status", { enum: ["open", "upheld", "reevaluate"] as const })
    .default("open")
    .notNull(),
  resolutionNote: text("resolutionNote"),
  resolvedByRole: text("resolvedByRole"),
  assignedToUserId: integer("assignedToUserId"),
  recheckMarks: real("recheckMarks"),
  recheckNote: text("recheckNote"),
  recheckedByUserId: integer("recheckedByUserId"),
  recheckedAt: integer("recheckedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  resolvedAt: integer("resolvedAt", { mode: "timestamp" }),
});

export const auditEvents = sqliteTable("auditEvents", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  actorRole: text("actorRole").notNull(),
  eventType: text("eventType").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  attempt: integer("attempt").default(1).notNull(),
  status: text("status", { enum: ["queued", "completed", "failed"] as const })
    .default("queued")
    .notNull(),
  output: text("output", { mode: "json" }),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type Bundle = typeof bundles.$inferSelect;
export type MarkingScheme = typeof markingSchemes.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type AnswerExtraction = typeof answerExtractions.$inferSelect;
export type TeacherAnnotation = typeof teacherAnnotations.$inferSelect;

export const bundleAssignments = sqliteTable("bundleAssignments", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  evaluatorUserId: integer("evaluatorUserId").notNull(),
  assignedByUserId: integer("assignedByUserId").notNull(),
  assignedAt: integer("assignedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export type BundleAssignment = typeof bundleAssignments.$inferSelect;

export const schools = sqliteTable("schools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  centerName: text("centerName").notNull(),
  location: text("location"),
  status: text("status", { enum: ["active", "inactive"] as const })
    .default("active")
    .notNull(),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

/**
 * Candidate identity is separate from the staff user table. A student can be
 * attached to a portal account, while centres can still retain candidates that
 * do not use the re-check portal.
 */
export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  userId: integer("userId").unique(),
  candidateId: text("candidateId").notNull().unique(),
  name: text("name").notNull(),
  dateOfBirth: text("dateOfBirth").notNull(),
  schoolId: text("schoolId").notNull(),
  examSessionId: text("examSessionId").notNull(),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const evaluatorProfiles = sqliteTable("evaluatorProfiles", {
  userId: integer("userId").primaryKey(),
  subject: text("subject"),
  centerName: text("centerName"),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type School = typeof schools.$inferSelect;
export type EvaluatorProfile = typeof evaluatorProfiles.$inferSelect;

export const examSessions = sqliteTable("examSessions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  centerName: text("centerName").notNull(),
  status: text("status", { enum: ["draft", "open", "closed"] as const })
    .default("draft")
    .notNull(),
  recheckStatus: text("recheckStatus", { enum: ["closed", "open"] as const })
    .default("closed")
    .notNull(),
  recheckOpenUntil: integer("recheckOpenUntil", { mode: "timestamp" }),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const examPapers = sqliteTable("examPapers", {
  id: text("id").primaryKey(),
  examSessionId: text("examSessionId").notNull(),
  subject: text("subject").notNull(),
  subjectCode: text("subjectCode").notNull(),
  paperCode: text("paperCode").notNull(),
  title: text("title").notNull(),
  className: text("className"),
  setNumber: text("setNumber"),
  bundleLabel: text("bundleLabel"),
  maximumMarks: integer("maximumMarks").notNull(),
  expectedQuestionCount: integer("expectedQuestionCount").default(0).notNull(),
  schemeId: text("schemeId"),
  qrToken: text("qrToken").notNull().unique(),
  qrStatus: text("qrStatus", {
    enum: ["active", "revoked", "expired"] as const,
  })
    .default("active")
    .notNull(),
  qrSchemaVersion: integer("qrSchemaVersion").default(1).notNull(),
  qrIssuedAt: integer("qrIssuedAt", { mode: "timestamp" }),
  qrExpiresAt: integer("qrExpiresAt", { mode: "timestamp" }),
  status: text("status", { enum: ["active", "closed"] as const })
    .default("active")
    .notNull(),
  isDemo: integer("isDemo", { mode: "boolean" }).default(false).notNull(),
  createdByUserId: integer("createdByUserId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export const recheckRequests = sqliteTable("recheckRequests", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  studentReference: text("studentReference").notNull(),
  reason: text("reason").notNull(),
  status: text("status", {
    enum: ["requested", "assigned", "resolved", "rejected"] as const,
  })
    .default("requested")
    .notNull(),
  assignedToUserId: integer("assignedToUserId"),
  resolutionNote: text("resolutionNote"),
  createdAt: integer("createdAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type ExamSession = typeof examSessions.$inferSelect;
export type ExamPaper = typeof examPapers.$inferSelect;
export type RecheckRequest = typeof recheckRequests.$inferSelect;
export type Student = typeof students.$inferSelect;
