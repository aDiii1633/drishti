import type { Express } from "express";
import { and, eq, ne } from "drizzle-orm";
import { bundles } from "../drizzle/schema";
import { getDb } from "./db";
import { persistAIGrades } from "./gradeEngine";
import { tokenFromRequest, verifyRoleSession } from "./roleAuth";
import { z } from "zod";

const tokenInput = z
  .string()
  .min(10)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const secondReaderInput = z
  .object({ bundleId: z.string().trim().min(1).max(128) })
  .strict();

export function registerDrishtiApi(app: Express) {
  app.get("/api/v1/health", async (_req, res) => {
    try {
      const db = await getDb();
      return res.json({
        ok: true,
        database: db ? "ready" : "unavailable",
        timestamp: new Date().toISOString(),
      });
    } catch {
      return res
        .status(503)
        .json({
          ok: false,
          database: "unavailable",
          timestamp: new Date().toISOString(),
        });
    }
  });
  app.get("/api/v1/scalemax/status", async (_req, res) => {
    const scaleMaxReady = Boolean(
      process.env.SCALEMAX_BASE_URL && process.env.SCALEMAX_API_KEY
    );
    const builtInReady = Boolean(
      process.env.BUILT_IN_FORGE_API_URL && process.env.BUILT_IN_FORGE_API_KEY
    );
    const documentFileQaEnabled =
      process.env.SCALEMAX_DOCUMENT_FILE_QA === "true";
    res.set("Cache-Control", "no-store");
    return res.json({
      provider: scaleMaxReady
        ? "ScaleMax-compatible"
        : "Manus built-in document reader",
      ready: scaleMaxReady || builtInReady,
      scaleMaxReady,
      builtInReady,
      documentFileQaEnabled,
      documentReader:
        documentFileQaEnabled && scaleMaxReady ? "ScaleMax" : "Manus built-in",
      retries: 2,
      denominatorPolicy: ["paper", "operator", "catalog"],
    });
  });
  app.get("/api/v1/qr/verify/:token", async (req, res) => {
    const parsed = tokenInput.safeParse(req.params.token);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          verified: false,
          message: "The verification token format is invalid.",
        });
    try {
      const db = await getDb();
      if (!db)
        return res
          .status(503)
          .json({
            verified: false,
            message: "Verification is temporarily unavailable.",
          });
      const bundle = (
        await db
          .select()
          .from(bundles)
          .where(eq(bundles.qrToken, parsed.data))
          .limit(1)
      )[0];
      if (!bundle)
        return res
          .status(404)
          .json({
            verified: false,
            message: "No Drishti bundle matches this verification token.",
          });
      return res.json({
        verified: bundle.status === "finalized",
        bundleId: bundle.id,
        subject: bundle.subject,
        status: bundle.status,
        finalizedAt: bundle.status === "finalized" ? bundle.updatedAt : null,
      });
    } catch {
      return res
        .status(503)
        .json({
          verified: false,
          message: "Verification is temporarily unavailable.",
        });
    }
  });
  app.post("/api/v1/ai-read", async (req, res) => {
    const session = await verifyRoleSession(tokenFromRequest(req.headers));
    if (!session)
      return res
        .status(401)
        .json({ error: "A valid Drishti role session is required." });
    if (!["evaluator", "moderator", "admin"].includes(session.role))
      return res
        .status(403)
        .json({
          error:
            "AI second reader is restricted to evaluation and moderation desks.",
        });
    const parsed = secondReaderInput.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          error:
            parsed.error.issues[0]?.message ?? "A valid bundleId is required.",
        });
    try {
      const outcome = await persistAIGrades({
        bundleId: parsed.data.bundleId,
        mode: "second-reader",
      });
      const db = await getDb();
      if (db)
        await db
          .update(bundles)
          .set({ status: "review" })
          .where(
            and(
              eq(bundles.id, parsed.data.bundleId),
              ne(bundles.status, "finalized")
            )
          );
      return res.json({ reader: "second", ...outcome });
    } catch (error) {
      return res
        .status(422)
        .json({
          error:
            error instanceof Error
              ? error.message
              : "Second-reader request failed.",
        });
    }
  });
}
