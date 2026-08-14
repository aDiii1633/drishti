import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "operator", "evaluator", "moderator", "admin"] as const }).default("user").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const bundles = sqliteTable("bundles", {
  id: text("id").primaryKey(),
  candidateName: text("candidateName").notNull(),
  subject: text("subject").notNull(),
  status: text("status", { enum: ["intake", "review", "grading", "moderation", "finalized"] as const }).default("intake").notNull(),
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
  coverageComplete: integer("coverageComplete", { mode: "boolean" }).default(false).notNull(),
  schemeId: text("schemeId"),
  qrToken: text("qrToken"),
  createdByRole: text("createdByRole").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  artifactType: text("artifactType", { enum: ["questionPaper", "answerBooklet", "replacementPage", "finalPdf"] as const }).notNull(),
  fileName: text("fileName").notNull(),
  mimeType: text("mimeType").notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  pageNumber: integer("pageNumber"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const pageChecks = sqliteTable("pageChecks", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  pageNumber: integer("pageNumber").notNull(),
  clarity: text("clarity", { enum: ["CLEAR", "BLURRY"] as const }).notNull(),
  laplacianVariance: integer("laplacianVariance").notNull(),
  reason: text("reason").notNull(),
  pageDataUrl: text("pageDataUrl"),
  checkedAt: integer("checkedAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const clarityCalibrationSamples = sqliteTable("clarityCalibrationSamples", {
  id: text("id").primaryKey(),
  sourceLabel: text("sourceLabel").notNull(),
  expectedClarity: text("expectedClarity", { enum: ["CLEAR", "BLURRY"] as const }).notNull(),
  observedClarity: text("observedClarity", { enum: ["CLEAR", "BLURRY"] as const }).notNull(),
  laplacianVariance: integer("laplacianVariance").notNull(),
  reviewerNote: text("reviewerNote"),
  createdByRole: text("createdByRole").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const markingSchemes = sqliteTable("markingSchemes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  maximumMarks: integer("maximumMarks").notNull(),
  questions: text("questions", { mode: "json" }).notNull(),
  createdByRole: text("createdByRole").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const evaluations = sqliteTable("evaluations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  questionId: text("questionId").notNull(),
  questionLabel: text("questionLabel").notNull(),
  schemeMaximum: integer("schemeMaximum").notNull(),
  humanMarks: integer("humanMarks"),
  aiMarks: integer("aiMarks"),
  feedback: text("feedback"),
  confidence: integer("confidence"),
  pagesViewed: text("pagesViewed", { mode: "json" }),
  reviewedByRole: text("reviewedByRole"),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).$defaultFn(() => new Date()).$onUpdateFn(() => new Date()).notNull(),
});

export const deviations = sqliteTable("deviations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  evaluationId: text("evaluationId").notNull(),
  delta: integer("delta").notNull(),
  status: text("status", { enum: ["open", "upheld", "reevaluate"] as const }).default("open").notNull(),
  resolutionNote: text("resolutionNote"),
  resolvedByRole: text("resolvedByRole"),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
  resolvedAt: integer("resolvedAt", { mode: "timestamp" }),
});

export const auditEvents = sqliteTable("auditEvents", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  actorRole: text("actorRole").notNull(),
  eventType: text("eventType").notNull(),
  detail: text("detail").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  bundleId: text("bundleId").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  attempt: integer("attempt").default(1).notNull(),
  status: text("status", { enum: ["queued", "completed", "failed"] as const }).default("queued").notNull(),
  output: text("output", { mode: "json" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).$defaultFn(() => new Date()).notNull(),
});

export type Bundle = typeof bundles.$inferSelect;
export type MarkingScheme = typeof markingSchemes.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
