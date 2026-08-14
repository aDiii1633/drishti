import type { Express } from "express";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { getStoredContentType, normalizeKey, STORAGE_ROOT } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const rawKey = (req.params as Record<string, string>)[0];
    if (!rawKey) {
      res.status(400).send("Missing storage key");
      return;
    }

    let key: string;
    try {
      key = normalizeKey(rawKey);
    } catch {
      res.status(400).send("Invalid storage key");
      return;
    }
    const filePath = path.resolve(STORAGE_ROOT, ...key.split("/"));

    // Guard against a requested key escaping the storage root via `..`
    // segments - never serve a path outside local-storage/.
    if (
      filePath !== STORAGE_ROOT &&
      !filePath.startsWith(STORAGE_ROOT + path.sep)
    ) {
      res.status(400).send("Invalid storage key");
      return;
    }

    try {
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        res.status(404).send("Not found");
        return;
      }
    } catch {
      // Never fabricate a response for a file that isn't actually on disk.
      res.status(404).send("Not found");
      return;
    }

    const contentType = await getStoredContentType(key);
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", contentType ?? "application/octet-stream");

    const stream = createReadStream(filePath);
    stream.on("error", err => {
      console.error("[StorageProxy] stream error:", err);
      if (!res.headersSent) res.status(500);
      res.end();
    });
    stream.pipe(res);
  });
}
