import { COOKIE_NAME } from "@shared/const";
import {
  bundles,
  clarityCalibrationSamples,
  deviations,
  documents,
  evaluations,
  generations,
  markingSchemes,
  pageChecks,
  auditEvents,
} from "../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "./db";
import {
  extractContent,
  extractSchemeFromPdf,
  parseModelJson,
  persistAIGrades,
  resolveDenominator,
} from "./gradeEngine";
import { bundleDocumentIntegrity } from "./documentIntegrity";
import {
  finalPdfArtifact,
  replacementPageArtifact,
  sourceArtifactRows,
} from "./documentArtifacts";
import { issueRoleSession } from "./roleAuth";
import { DRISHTI_ROLES, type SchemeQuestion } from "../shared/drishti";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  router,
  roleProcedure,
  withRoles,
} from "./_core/trpc";
import { storageDelete, storageGetBuffer, storagePut } from "./storage";
import { summarizeCalibration } from "./calibration";
import { decodeImageDataUrl, decodePdfUpload } from "./filePayload";

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

async function database() {
  const db = await getDb();
  if (!db) throw new Error("The database is unavailable.");
  return db;
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

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  session: router({
    selectRole: publicProcedure
      .input(z.object({ role: roleInput }))
      .mutation(({ input }) => issueRoleSession(input.role)),
    current: roleProcedure.query(({ ctx }) => ctx.roleSession),
  }),
  dashboard: router({
    summary: roleProcedure.query(async () => {
      const db = await database();
      const [allBundles, allDeviations] = await Promise.all([
        db.select().from(bundles),
        db.select().from(deviations),
      ]);
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
  }),
  schemes: router({
    list: roleProcedure.query(async () =>
      (await database())
        .select()
        .from(markingSchemes)
        .orderBy(desc(markingSchemes.createdAt))
    ),
    create: withRoles("operator", "admin")
      .input(
        z.object({
          title: z.string().min(3),
          subject: z.string().min(2),
          maximumMarks: z.number().int().positive(),
          questions: z
            .array(
              z.object({
                id: z.string().min(1),
                label: z.string().min(1),
                maximumMarks: z.number().int().positive(),
                keyPoints: z.array(z.string()),
              })
            )
            .min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const total = input.questions.reduce(
          (sum, question) => sum + question.maximumMarks,
          0
        );
        if (total > input.maximumMarks)
          throw new Error("Question maxima cannot exceed the scheme maximum.");
        const db = await database();
        const id = nanoid(16);
        await db.insert(markingSchemes).values({
          id,
          ...input,
          questions: input.questions as SchemeQuestion[],
          createdByRole: ctx.roleSession.role,
        });
        return { id };
      }),
    extractFromPdf: withRoles("operator", "admin")
      .input(
        z.object({
          subject: z.string().min(2),
          title: z.string().min(1).optional(),
          questionPaper: fileInput,
        })
      )
      .mutation(async ({ ctx, input }) => {
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
  bundles: router({
    list: roleProcedure.query(async () =>
      (await database()).select().from(bundles).orderBy(desc(bundles.updatedAt))
    ),
    get: roleProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const db = await database();
        const bundle = (
          await db
            .select()
            .from(bundles)
            .where(eq(bundles.id, input.id))
            .limit(1)
        )[0];
        if (!bundle) throw new Error("Bundle not found.");
        const [pages, scoreRows, schemeRows, documentRows, generationRows] =
          await Promise.all([
            db
              .select()
              .from(pageChecks)
              .where(eq(pageChecks.bundleId, input.id)),
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
          ]);
        const scheme = schemeRows[0] ?? null;
        const documentIntegrity = bundleDocumentIntegrity(
          documentRows.map(document => document.artifactType),
          bundle.status === "review" || bundle.status === "finalized"
        );
        return {
          bundle,
          pages,
          evaluations: scoreRows,
          scheme,
          documents: documentRows,
          denominator: resolveDenominator(bundle),
          documentIntegrity,
          latestGeneration:
            [...generationRows].sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime()
            )[0] ?? null,
        };
      }),
    create: withRoles("operator", "admin")
      .input(
        z
          .object({
            candidateName: z.string().trim().min(2).max(160),
            subject: z.string().trim().min(2).max(160),
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
    replacePage: withRoles("operator", "admin")
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
    finalize: withRoles("operator", "admin")
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
        const bundle = await requireBundle(db, input.bundleId);
        if (bundle.status === "finalized") {
          if (bundle.qrToken === input.qrToken && bundle.finalUrl)
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
    extractScheme: withRoles("operator", "admin")
      .input(z.object({ bundleId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = (
          await db
            .select()
            .from(bundles)
            .where(eq(bundles.id, input.bundleId))
            .limit(1)
        )[0];
        if (!bundle) throw new Error("Bundle not found.");
        if (!bundle.questionPaperKey)
          throw new Error("This bundle has no stored question paper to read.");
        const pdfBytes = await storageGetBuffer(bundle.questionPaperKey);
        const extracted = await extractSchemeFromPdf({
          pdfBase64: pdfBytes.toString("base64"),
          filename: bundle.questionPaperKey,
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
  marking: router({
    save: withRoles("evaluator", "moderator", "admin")
      .input(
        z.object({
          id: z.string().optional(),
          bundleId: z.string(),
          questionId: z.string(),
          questionLabel: z.string(),
          schemeMaximum: z.number().int().nonnegative(),
          humanMarks: z.number().int().nonnegative().nullable(),
          pagesViewed: z.array(z.number().int().positive()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await database();
        const bundle = await requireBundle(db, input.bundleId);
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
        const id = input.id ?? nanoid(16);
        const existing = input.id
          ? (
              await db
                .select()
                .from(evaluations)
                .where(eq(evaluations.id, input.id))
                .limit(1)
            )[0]
          : undefined;
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
            ...input,
            questionLabel: question.label,
            schemeMaximum: question.maximumMarks,
            humanMarks,
            pagesViewed,
            aiMarks: existing?.aiMarks ?? null,
            feedback: existing?.feedback ?? null,
            confidence: existing?.confidence ?? null,
            reviewedByRole: ctx.roleSession.role,
          })
          .onConflictDoUpdate({
            target: evaluations.id,
            set: {
              humanMarks,
              pagesViewed,
              reviewedByRole: ctx.roleSession.role,
            },
          });
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
          "marking.saved",
          `${input.questionId} saved with a scheme-clamped human mark.`
        );
        return { id, humanMarks };
      }),
    aiGrade: withRoles("evaluator", "moderator", "admin")
      .input(
        z.object({
          bundleId: z.string(),
          secondReader: z.boolean().default(false),
        })
      )
      .mutation(async ({ input }) =>
        persistAIGrades({
          bundleId: input.bundleId,
          mode: input.secondReader ? "second-reader" : "primary",
        })
      ),
  }),
  deviations: router({
    list: withRoles("moderator", "admin").query(async () =>
      (await database())
        .select()
        .from(deviations)
        .orderBy(desc(deviations.createdAt))
    ),
    resolve: withRoles("moderator", "admin")
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
  calibration: router({
    list: withRoles("operator", "moderator", "admin").query(async () => {
      const rows = await (await database())
        .select()
        .from(clarityCalibrationSamples)
        .orderBy(desc(clarityCalibrationSamples.createdAt));
      return { rows, ...summarizeCalibration(rows) };
    }),
    record: withRoles("operator", "moderator", "admin")
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
      .query(async ({ input }) =>
        (await database())
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.bundleId, input.bundleId))
          .orderBy(desc(auditEvents.createdAt))
      ),
  }),
  admin: router({
    console: withRoles("admin").query(async () => {
      const db = await database();
      const [bundleRows, evaluationRows, eventRows] = await Promise.all([
        db.select().from(bundles),
        db.select().from(evaluations),
        db.select().from(auditEvents),
      ]);
      return {
        bundles: bundleRows,
        evaluations: evaluationRows,
        auditEvents: eventRows,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
