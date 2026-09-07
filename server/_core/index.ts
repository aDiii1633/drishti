import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { ENV } from "./env";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerDrishtiApi } from "../apiV1";
import { serveStatic, setupVite } from "./vite";
import { ensureDemoData } from "../demoData";
import { assertProductionRuntime, getAppMode } from "../runtimeMode";
import { getDb } from "../db";
import { migrate } from "drizzle-orm/libsql/migrator";

// Apply pending SQL migrations on boot so a fresh cloud database (Render disk,
// Turso, etc.) has its schema before ensureDemoData() or any request touches it.
// No-ops when the schema is already current; skipped when no DB is configured.
async function runMigrations() {
  const db = await getDb();
  if (!db) {
    console.warn("[migrate] no database configured; skipping migrations");
    return;
  }
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("[migrate] database schema is up to date");
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  assertProductionRuntime();
  console.log(`DRISHTI runtime mode: ${getAppMode()}`);
  await runMigrations();
  // Fast pass: accounts, schools, papers, students. Sign-in and dashboards work
  // as soon as this returns (~1-2s). The slow 25-bundle PDF seed runs after the
  // port is open so a cold start no longer hangs the health check / SPA for ~30s.
  const demo = await ensureDemoData({ includeBundles: false });
  if (demo.enabled) {
    console.log(`Demo mode ${demo.seeded ? "accounts ready" : "waiting for database"}.`);
  }
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  if (ENV.oAuthServerUrl) registerOAuthRoutes(app);
  registerDrishtiApi(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  process.env.DRISHTI_ACTIVE_PORT = String(port);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Now that the port is open, finish the slow part of the demo seed (25
    // answer-sheet bundles, one generated PDF each) in the background. Idempotent
    // and safe to fail — never crash the process over demo fixtures.
    ensureDemoData()
      .then(demo => {
        if (demo.enabled && demo.seeded) console.log("Demo mode ready (bundles seeded).");
      })
      .catch(error => console.error("[demo-seed] background bundle seed failed:", error));
  });
}

startServer().catch(console.error);
