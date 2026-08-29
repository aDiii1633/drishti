/**
 * Centralized Suprsonic integration. Every Suprsonic request in DRISHTI goes
 * through this module — no other file may call the API directly.
 *
 * Contract verified live against https://suprsonic.ai/docs/api:
 *   POST /v1/documents/extract
 *     body    { content | url, extraction_prompt, schema }
 *     200     { success, data: { extracted, content_length, truncated }, metadata, credits_used }
 *     failure { success: false, error: { detail, is_retriable, retry_after_seconds, ... } }
 *
 * Capability limits that matter to DRISHTI (confirmed in the API reference):
 *  - There is no chat/completion endpoint. Structured extraction is the only
 *    general LLM surface, and it accepts TEXT only.
 *  - There is no image or multimodal input, so a handwritten answer-sheet page
 *    cannot be read by Suprsonic. Callers must supply a text transcription.
 */

const SUPRSONIC_BASE_URL = "https://suprsonic.ai";
const EXTRACT_PATH = "/v1/documents/extract";
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 90_000;
/** The endpoint truncates long input; keep well inside it and flag when we cut. */
const MAX_CONTENT_CHARS = 24_000;

export class SuprsonicUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SuprsonicUnavailableError";
  }
}

export class SuprsonicVisionUnsupportedError extends Error {
  constructor() {
    super(
      "Suprsonic cannot read answer-sheet images. Supply an answer transcription, or set AI_PROVIDER=gemini for image-based evidence mapping."
    );
    this.name = "SuprsonicVisionUnsupportedError";
  }
}

type SuprsonicConfig = { apiKey: string; baseUrl: string };

type SuprsonicEnvelope = {
  success?: boolean;
  data?: { extracted?: unknown; truncated?: boolean } | null;
  error?: {
    detail?: string;
    title?: string;
    is_retriable?: boolean;
    retry_after_seconds?: number;
    error_category?: string;
  } | null;
  credits_used?: number;
  metadata?: { request_id?: string } | null;
};

export function getSuprsonicConfig(): SuprsonicConfig {
  const apiKey = process.env.SUPRSONIC_API_KEY?.trim();
  if (!apiKey)
    throw new SuprsonicUnavailableError(
      "AI evaluation could not be completed. Configure SUPRSONIC_API_KEY on the server or continue with manual grading."
    );
  return {
    apiKey,
    baseUrl: (process.env.SUPRSONIC_BASE_URL?.trim() || SUPRSONIC_BASE_URL).replace(/\/$/, ""),
  };
}

export function isSuprsonicConfigured() {
  return Boolean(process.env.SUPRSONIC_API_KEY?.trim());
}

function publicFailure() {
  // Never surface provider internals to the marking desk.
  return new SuprsonicUnavailableError(
    "AI evaluation could not be completed. Retry or continue with manual grading."
  );
}

function sleep(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * One structured-JSON request. `content` is the evidence text, `instruction`
 * is what to produce, `schema` is a JSON Schema object the response must match.
 */
export async function suprsonicExtract(input: {
  content: string;
  instruction: string;
  schema: Record<string, unknown>;
}): Promise<{ value: unknown; creditsUsed: number; truncated: boolean }> {
  const config = getSuprsonicConfig();
  const content = input.content.trim();
  if (!content)
    throw new SuprsonicUnavailableError(
      "No readable answer text was available for AI evaluation."
    );
  const clipped = content.length > MAX_CONTENT_CHARS;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${config.baseUrl}${EXTRACT_PATH}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: clipped ? content.slice(0, MAX_CONTENT_CHARS) : content,
          extraction_prompt: input.instruction,
          schema: input.schema,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // A non-JSON body (proxy or error page) must not crash the request path.
      const body = (await response.json().catch(() => null)) as SuprsonicEnvelope | null;

      if (!response.ok || body?.success !== true) {
        const retriable =
          body?.error?.is_retriable === true ||
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        // 401/402/400 will never succeed on retry; fail fast so the desk sees it.
        if (!retriable || attempt === MAX_ATTEMPTS) throw publicFailure();
        lastError = publicFailure();
        const waitSeconds = body?.error?.retry_after_seconds;
        await sleep(
          typeof waitSeconds === "number" && waitSeconds > 0
            ? Math.min(waitSeconds, 10) * 1000
            : 400 * attempt
        );
        continue;
      }

      const extracted = body.data?.extracted;
      if (extracted === undefined || extracted === null) {
        if (attempt === MAX_ATTEMPTS) throw publicFailure();
        lastError = publicFailure();
        await sleep(400 * attempt);
        continue;
      }

      return {
        value: extracted,
        creditsUsed: typeof body.credits_used === "number" ? body.credits_used : 0,
        truncated: clipped || body.data?.truncated === true,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : publicFailure();
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(400 * attempt);
    }
  }
  throw lastError ?? publicFailure();
}
