import type { InvokeParams, InvokeResult } from "./_core/llm";

type ScaleMaxModel = {
  id: string;
  capabilities?: { chat_completions?: boolean; route_available?: boolean };
};

function config() {
  const baseUrl = process.env.SCALEMAX_BASE_URL?.replace(/\/$/, "");
  const apiKey = process.env.SCALEMAX_API_KEY;
  if (!baseUrl || !apiKey)
    throw new Error(
      "ScaleMax is not configured. Add SCALEMAX_BASE_URL and SCALEMAX_API_KEY in project secrets."
    );
  return { baseUrl, apiKey };
}

export function isScaleMaxConfigured() {
  return Boolean(process.env.SCALEMAX_BASE_URL && process.env.SCALEMAX_API_KEY);
}

export function normalizeScaleMaxModel(
  model = process.env.SCALEMAX_MODEL ?? "gpt-5.6-terra"
) {
  return model.trim().toLowerCase().replace(/\s+/g, "-");
}

async function fetchAvailableScaleMaxModels(): Promise<ScaleMaxModel[]> {
  const { baseUrl, apiKey } = config();
  const response = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`ScaleMax model catalog failed (${response.status}).`);
  const body = (await response.json()) as { data?: ScaleMaxModel[] };
  const models = body.data ?? [];
  return models.filter(
    model =>
      model.capabilities?.chat_completions !== false &&
      model.capabilities?.route_available !== false
  );
}

export async function resolveScaleMaxModel() {
  const available = await fetchAvailableScaleMaxModels();
  const requested = normalizeScaleMaxModel();
  const selected =
    available.find(model => model.id === requested) ??
    available.find(model => model.id === "gpt-5.4") ??
    available.find(model => model.id === "gpt-5.5") ??
    available[0];
  if (!selected)
    throw new Error("ScaleMax returned no chat-completions model.");
  return {
    requested,
    selected: selected.id,
    usedFallback: selected.id !== requested,
  };
}

// resolveScaleMaxModel()'s fallback chain picks whatever model happens to be
// available for general chat use - it does not check whether that model can
// actually process an attached document. Confirmed by direct manual testing
// against this ScaleMax deployment (2026-08-13, real CBSE PDF): claude-haiku-4-5,
// claude-opus-4-6, and claude-opus-4-8 all silently ignore an attached file
// ("I don't see any attached document") while claude-opus-5 and claude-sonnet-5
// correctly read it. Every document-attached ScaleMax call (scheme extraction,
// printed-maximum extraction, AI grading) must route through this resolver
// instead of the general one, or it will "succeed" while never actually
// reading the paper - the exact fabrication risk this product must avoid.
//
// IMPORTANT (re-confirmed 2026-08-14): this deployment's model catalog is
// genuinely volatile - both listed models can disappear from the catalog
// entirely (observed directly: a live /models fetch returned zero Claude
// models of any kind). When that happens, DO NOT fall back to "whatever else
// is available" - direct testing on that exact day showed several other
// models (gemini-2.5-flash, gemini-3.5-flash, gemini-3.6-flash) respond with
// well-formed, non-empty, PLAUSIBLE-LOOKING JSON while having fabricated an
// entirely different exam paper from a different subject (Computer Science,
// Databases, Mathematics questions returned for an Accountancy PDF) rather
// than reporting failure - the exact silent-fabrication risk this whole
// product exists to prevent. A model that returns SOMETHING is not evidence
// it read the real document. Only these two verified models are trusted; if
// neither is in the live catalog, fail loudly and immediately rather than
// guess.
export const DOCUMENT_CAPABLE_SCALEMAX_MODELS = [
  "claude-opus-5",
  "claude-sonnet-5",
] as const;

function availableDocumentModels(
  available: ScaleMaxModel[],
  requested: string
) {
  const byId = new Map(available.map(model => [model.id, model]));
  return [requested, ...DOCUMENT_CAPABLE_SCALEMAX_MODELS]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .filter(id =>
      DOCUMENT_CAPABLE_SCALEMAX_MODELS.includes(
        id as (typeof DOCUMENT_CAPABLE_SCALEMAX_MODELS)[number]
      )
    )
    .map(id => byId.get(id))
    .filter((model): model is ScaleMaxModel => Boolean(model));
}

export async function resolveScaleMaxDocumentModel() {
  const available = await fetchAvailableScaleMaxModels();
  const requested = normalizeScaleMaxModel();
  const selected = availableDocumentModels(available, requested)[0];
  if (!selected) {
    throw new Error(
      `No verified document-reading model (${DOCUMENT_CAPABLE_SCALEMAX_MODELS.join(" or ")}) is currently available from ScaleMax. ` +
        "Other available models are not trusted for this: they can return a plausible-looking but fabricated result instead of reporting " +
        "that they cannot read the file. Try again shortly, or add the scheme manually in Teacher setup."
    );
  }
  return {
    requested,
    selected: selected.id,
    usedFallback: selected.id !== requested,
  };
}

function normalizeMessages(messages: InvokeParams["messages"]) {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
  }));
}

async function request(
  model: string,
  params: InvokeParams
): Promise<InvokeResult> {
  const { baseUrl, apiKey } = config();
  const payload: Record<string, unknown> = {
    model,
    messages: normalizeMessages(params.messages),
    max_tokens: params.max_tokens ?? params.maxTokens ?? 4096,
  };
  const responseFormat = params.response_format ?? params.responseFormat;
  if (responseFormat) payload.response_format = responseFormat;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await response.text();
  if (!response.ok)
    throw new Error(
      `ScaleMax chat failed (${response.status}): ${raw.slice(0, 500) || response.statusText}`
    );
  if (!raw.trim())
    throw new Error("ScaleMax chat returned an empty response body.");
  return JSON.parse(raw) as InvokeResult;
}

export async function invokeScaleMax(params: InvokeParams) {
  const model = params.model ?? (await resolveScaleMaxModel()).selected;
  try {
    return await request(model, params);
  } catch (error) {
    const fallback = "gpt-5.4";
    if (model === fallback) throw error;
    return request(fallback, { ...params, model: fallback });
  }
}

/**
 * Invoke ScaleMax for a request that includes a PDF.
 *
 * This path deliberately never falls back to the general GPT route. The
 * general route can return convincing text while silently dropping the file,
 * which previously turned "PDF not attached" into a zero-mark scheme. Only
 * document readers verified against this deployment are eligible here.
 */
export async function invokeScaleMaxDocument(params: InvokeParams) {
  const available = await fetchAvailableScaleMaxModels();
  const requested = normalizeScaleMaxModel(params.model);
  const candidates = availableDocumentModels(available, requested);
  if (!candidates.length) {
    throw new Error(
      `No verified document-reading model (${DOCUMENT_CAPABLE_SCALEMAX_MODELS.join(" or ")}) is currently available from ScaleMax.`
    );
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      return await request(candidate.id, { ...params, model: candidate.id });
    } catch (error) {
      failures.push(
        `${candidate.id}: ${error instanceof Error ? error.message : "request failed"}`
      );
    }
  }
  throw new Error(
    `Verified ScaleMax document readers did not complete the request. ${failures.join(" | ")}`
  );
}
