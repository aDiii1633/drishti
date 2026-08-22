export class QrDecoderUnavailableError extends Error {
  constructor() {
    super("QR image decoding is temporarily unavailable.");
  }
}

export type QrDecodeResult = {
  payload: string;
  frameNumber: number | null;
};

function scanGateQrConfig() {
  const baseUrl = process.env.SCANGATE_BASE_URL?.trim().replace(/\/$/, "");
  const reviewerToken = process.env.SCANGATE_REVIEWER_TOKEN?.trim();
  if (!baseUrl || !reviewerToken) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { baseUrl, reviewerToken };
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function decodeQrWithScanGate(input: {
  bytes: Buffer;
  mimeType: "image/jpeg" | "image/png";
}): Promise<QrDecodeResult | null> {
  const config = scanGateQrConfig();
  if (!config) throw new QrDecoderUnavailableError();
  const form = new FormData();
  const copy = new Uint8Array(input.bytes.length);
  copy.set(input.bytes);
  form.set("image", new Blob([copy.buffer], { type: input.mimeType }), `qr.${input.mimeType === "image/png" ? "png" : "jpg"}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${config.baseUrl}/api/v1/captures/qr`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.reviewerToken}`,
        accept: "application/json",
      },
      body: form,
      signal: controller.signal,
    });
    const body = asRecord(await response.json().catch(() => null));
    if (response.status === 422) return null;
    if (!response.ok) throw new QrDecoderUnavailableError();
    const payload = typeof body?.payload === "string" ? body.payload.trim() : "";
    if (!payload || payload.length > 400) throw new QrDecoderUnavailableError();
    return {
      payload,
      frameNumber: typeof body?.frame_number === "number" ? body.frame_number : null,
    };
  } catch (error) {
    if (error instanceof QrDecoderUnavailableError) throw error;
    throw new QrDecoderUnavailableError();
  } finally {
    clearTimeout(timeout);
  }
}
