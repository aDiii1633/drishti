import path from "path";
import { sanitizeStorageFileName } from "./storage";

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type DecodedUpload = {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
};

function splitPayload(value: string): {
  encoded: string;
  declaredMime?: string;
} {
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:")) return { encoded: trimmed };

  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(trimmed);
  if (!match) throw new Error("The upload must be a base64-encoded file.");
  return { declaredMime: match[1].toLowerCase(), encoded: match[2] };
}

function decodeBase64(value: string, maxBytes: number): Buffer {
  const compact = value.replace(/\s/g, "");
  if (!compact || !BASE64_PATTERN.test(compact)) {
    throw new Error("The upload contains invalid base64 data.");
  }
  const approximateBytes = Math.floor((compact.length * 3) / 4);
  if (approximateBytes > maxBytes + 2)
    throw new Error(
      `The upload exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`
    );

  const bytes = Buffer.from(compact, "base64");
  if (!bytes.length) throw new Error("The uploaded file is empty.");
  if (bytes.length > maxBytes)
    throw new Error(
      `The upload exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`
    );
  return bytes;
}

export function decodePdfUpload(
  input: { name: string; base64: string },
  maxBytes = 24 * 1024 * 1024
): DecodedUpload {
  const { encoded, declaredMime } = splitPayload(input.base64);
  if (declaredMime && declaredMime !== "application/pdf")
    throw new Error("Only PDF uploads are accepted here.");
  const bytes = decodeBase64(encoded, maxBytes);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new Error("The uploaded file is not a valid PDF.");

  const sanitized = sanitizeStorageFileName(input.name, "document.pdf");
  const fileName =
    path.extname(sanitized).toLowerCase() === ".pdf"
      ? sanitized
      : `${sanitized}.pdf`;
  return { bytes, fileName, mimeType: "application/pdf" };
}

export function decodeImageDataUrl(
  value: string,
  maxBytes = 10 * 1024 * 1024
): DecodedUpload {
  const { encoded, declaredMime } = splitPayload(value);
  if (declaredMime !== "image/png" && declaredMime !== "image/jpeg") {
    throw new Error("Replacement pages must be PNG or JPEG images.");
  }
  const bytes = decodeBase64(encoded, maxBytes);
  const isPng =
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;
  if (
    (declaredMime === "image/png" && !isPng) ||
    (declaredMime === "image/jpeg" && !isJpeg)
  ) {
    throw new Error(
      "The replacement image does not match its declared file type."
    );
  }
  const extension = declaredMime === "image/png" ? "png" : "jpg";
  return {
    bytes,
    fileName: `replacement-page.${extension}`,
    mimeType: declaredMime,
  };
}
