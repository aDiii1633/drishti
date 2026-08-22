import type { Express } from "express";
import { eq } from "drizzle-orm";
import { bundles } from "../drizzle/schema";
import { getDb } from "./db";
import { z } from "zod";

const tokenInput = z.string().min(10).max(160).regex(/^[A-Za-z0-9_-]+$/);

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
  app.get("/api/v1/ai/status", async (_req, res) => {
    const openRouterReady = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_MODEL);
    res.set("Cache-Control", "no-store");
    return res.json({
      provider: "openrouter",
      model: "qwen/qwen2.5-vl-72b-instruct:free",
      ready: openRouterReady,
      modelConfigured: Boolean(process.env.OPENROUTER_MODEL),
      retries: 2,
      evaluationMode: "question-first-vision",
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
}
