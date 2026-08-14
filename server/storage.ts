// Local filesystem storage helpers (replaces Manus's Forge/S3-presigned
// storage, which is unreachable outside Manus's own hosting).
//
// Uploads are written straight to disk under <project-root>/local-storage/<key>.
// Downloads are served by server/_core/storageProxy.ts via GET /manus-storage/<key>
// - the /manus-storage/ URL path prefix is unchanged so every existing call site
// (client and server) keeps working without modification.

import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

// Root directory on disk where all uploaded files (and their content-type
// sidecar files) live. Exported so the storage proxy route can resolve the
// exact same paths without duplicating the convention.
export const STORAGE_ROOT = path.resolve(process.cwd(), "local-storage");

export function normalizeKey(relKey: string): string {
  if (typeof relKey !== "string" || !relKey.trim() || relKey.includes("\0")) {
    throw new Error("Invalid storage key");
  }

  const slashKey = relKey.replace(/\\/g, "/").replace(/^\/+/, "");
  const key = path.posix.normalize(slashKey);
  if (
    key === "." ||
    key === ".." ||
    key.startsWith("../") ||
    path.posix.isAbsolute(key)
  ) {
    throw new Error("Invalid storage key");
  }
  return key;
}

/** Keep user-supplied names inside a single storage-key segment. */
export function sanitizeStorageFileName(
  fileName: string,
  fallback = "document.bin"
): string {
  const leaf =
    fileName.replace(/\\/g, "/").split("/").pop()?.normalize("NFKC") ?? "";
  const safe = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 160);
  return safe && safe !== "." && safe !== ".." ? safe : fallback;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function filePathFor(key: string): string {
  const normalized = normalizeKey(key);
  const filePath = path.resolve(STORAGE_ROOT, ...normalized.split("/"));
  if (
    filePath === STORAGE_ROOT ||
    !filePath.startsWith(`${STORAGE_ROOT}${path.sep}`)
  ) {
    throw new Error("Invalid storage key");
  }
  return filePath;
}

function metaPathFor(key: string): string {
  return path.join(STORAGE_ROOT, `${key}.meta.json`);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const filePath = filePathFor(key);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
  await writeFile(metaPathFor(key), JSON.stringify({ contentType }), "utf-8");

  return { key, url: `/manus-storage/${key}` };
}

export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  await Promise.all([
    rm(filePathFor(key), { force: true }),
    rm(metaPathFor(key), { force: true }),
  ]);
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

// Reads a previously-stored file's raw bytes directly off disk. Used when a
// caller needs to inline the file (e.g. as a base64 data: URL) rather than
// hand out a fetchable URL - see storageGetSignedUrl's caveat below.
export async function storageGetBuffer(relKey: string): Promise<Buffer> {
  const key = normalizeKey(relKey);
  return readFile(filePathFor(key));
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  // gradeEngine.ts passes this straight to an external LLM API as a
  // `file_url`, so it must be a fully-qualified, fetchable URL - a bare
  // /manus-storage/... path only resolves implicitly in a browser context.
  const origin =
    process.env.PUBLIC_APP_URL?.replace(/\/$/, "") ??
    `http://127.0.0.1:${process.env.DRISHTI_ACTIVE_PORT || process.env.PORT || 3000}`;
  return `${origin}/manus-storage/${key.split("/").map(encodeURIComponent).join("/")}`;
}

// Read back the content-type sidecar written by storagePut. Used by the
// storage proxy route to set the right Content-Type header when serving a
// file. Returns undefined (never a fabricated guess) if no sidecar exists.
export async function getStoredContentType(
  relKey: string
): Promise<string | undefined> {
  try {
    const raw = await readFile(metaPathFor(normalizeKey(relKey)), "utf-8");
    const meta = JSON.parse(raw) as { contentType?: string };
    return meta.contentType;
  } catch {
    return undefined;
  }
}
