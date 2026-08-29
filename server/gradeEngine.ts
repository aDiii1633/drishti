import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  bundles,
  deviations,
  evaluations,
  generations,
  markingSchemes,
} from "../drizzle/schema";
import type { ScoreDenominator, SchemeQuestion } from "../shared/drishti";
import { getDb } from "./db";
import {
  invokeLLM,
  listLLMModels,
  type FileContent,
  type FilePayloadContent,
  type InvokeParams,
  type InvokeResult,
} from "./_core/llm";
import {
  invokeScaleMaxDocument,
  isScaleMaxConfigured,
  resolveScaleMaxDocumentModel,
} from "./scalemax";
import { storageGetBuffer, storageGetSignedUrl } from "./storage";
import { structuredJson } from "./aiGrading";

type Grade = {
  questionId: string;
  marks: number;
  feedback: string;
  confidence: number;
};

export function resolveDenominator(bundle: {
  printedMaximumMarks: number | null;
  operatorConfirmedTotal: number | null;
  catalogTotal: number;
}): ScoreDenominator {
  if (bundle.printedMaximumMarks && bundle.printedMaximumMarks > 0) {
    return {
      total: bundle.printedMaximumMarks,
      source: "paper",
      coverageComplete: true,
      note: "Printed Maximum Marks extracted from the question paper.",
    };
  }
  if (bundle.operatorConfirmedTotal && bundle.operatorConfirmedTotal > 0) {
    return {
      total: bundle.operatorConfirmedTotal,
      source: "operator",
      coverageComplete: true,
      note: "Operator-confirmed total used because the paper maximum was unavailable.",
    };
  }
  return {
    total: bundle.catalogTotal,
    source: "catalog",
    coverageComplete: false,
    note: "Catalog total is a fallback; coverage remains incomplete until a paper or operator total is confirmed.",
  };
}

type GradingInvoker = (params: InvokeParams) => Promise<InvokeResult>;

// ScaleMax-compatible gateways only honor PDF input inlined as a data: URL
// under a "file" content part (the OpenAI Chat Completions convention) - a
// "file_url" pointing at this app's own local storage is silently dropped
// (confirmed by direct testing: every ScaleMax model replied "I don't see
// any attached document" even though the URL was independently fetchable,
// since it's only reachable from this machine, not from ScaleMax's servers).
// Manus's Forge API is the opposite: it expects a URL it can fetch from its
// own hosting, so that path keeps using the signed-URL FileContent shape.
async function buildDocumentPart(
  key: string,
  useInlineFile: boolean
): Promise<FileContent | FilePayloadContent> {
  if (useInlineFile) {
    const buffer = await storageGetBuffer(key);
    return {
      type: "file",
      file: {
        filename: key.split("/").pop() ?? "document.pdf",
        file_data: `data:application/pdf;base64,${buffer.toString("base64")}`,
      },
    };
  }
  return {
    type: "file_url",
    file_url: {
      url: await storageGetSignedUrl(key),
      mime_type: "application/pdf",
    },
  };
}

async function extractPrintedMaximum(
  bundle: { questionPaperKey: string | null },
  model: string,
  invoke: GradingInvoker,
  useInlineFile: boolean
): Promise<number | undefined> {
  if (!bundle.questionPaperKey) return undefined;
  try {
    const response = await invoke({
      model,
      messages: [
        {
          role: "system",
          content:
            "Extract only the explicitly printed Maximum Marks total from an examination paper. Do not infer a total from questions. Return null when no printed total exists.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Read the paper's printed Maximum Marks value.",
            },
            await buildDocumentPart(bundle.questionPaperKey, useInlineFile),
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 250,
    });
    const maximum = (
      parseModelJson(extractContent(response)) as { maximumMarks?: unknown }
    ).maximumMarks;
    return typeof maximum === "number" &&
      Number.isInteger(maximum) &&
      maximum > 0
      ? maximum
      : undefined;
  } catch {
    return undefined;
  }
}

// Transcribes every printed question (id/label/maximumMarks/keyPoints) from a
// question paper PDF into a marking scheme shape, ready for markingSchemes
// insertion by the caller. Shared by schemes.extractFromPdf (a fresh upload)
// and bundles.extractScheme (re-reading a paper already sitting in storage)
// in routers.ts.
export async function extractSchemeFromPdf(input: {
  pdfBase64: string;
  filename: string;
}): Promise<{
  paperTitle: string;
  printedMaximumMarks: number | null;
  maximumMarks: number;
  questions: SchemeQuestion[];
  questionCount: number;
}> {
  const systemPrompt =
    "You are Drishti's marking-scheme transcriber. You read a printed examination question paper and transcribe ONLY what is printed. Never summarize, skip, or merge questions. Never invent a question or a mark value that is not printed on the paper. If a question's marks are not printed directly beside it, derive the mark from an explicit section-header rule (for example 'Q1-Q20 carry 1 mark each'); never guess a number that has no textual basis in the paper.";
  const userPrompt = `Read the attached question paper PDF in full and transcribe every printed question.

For each question return:
- "id": the question number exactly as printed (e.g. "Q1", "2", "Section A Q3").
- "label": a short one-line descriptive title derived from the question's own text (NOT the full question text verbatim) so it fits a small tab in a marking UI.
- "maximumMarks": the printed marks for that question (an integer). If not printed directly beside the question, derive it from a section-header rule stating marks per question; never guess with no textual basis.
- "keyPoints": a short list of the specific points a full-mark answer must cover, derived ONLY from the question's own text/instructions. Use an empty array for objective/MCQ-style questions.

Also report the paper's printed "Maximum Marks" header total if one is stated (e.g. "Maximum Marks: 80"), separately from the sum of the individual question marks, as "printedMaximumMarks". Use null if no such header exists.

Return ONLY this JSON shape, with no extra commentary:
{"paperTitle":"","printedMaximumMarks":0,"questions":[{"id":"Q1","label":"","maximumMarks":1,"keyPoints":[]}]}`;

  let parsed: unknown;
  try {
    const response = await structuredJson({
      schemaName: "question_paper_scheme",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["paperTitle", "printedMaximumMarks", "questions"],
        properties: {
          paperTitle: { type: "string" },
          printedMaximumMarks: { type: ["integer", "null"], minimum: 0 },
          questions: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "label", "maximumMarks", "keyPoints"],
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                maximumMarks: { type: "integer", minimum: 1 },
                keyPoints: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      system: systemPrompt,
      userContent: [
        { type: "text", text: `${userPrompt}\n\nSource filename: ${input.filename}` },
        {
          type: "file",
          file: {
            filename: input.filename,
            file_data: `data:application/pdf;base64,${input.pdfBase64}`,
          },
        },
      ],
      maxOutputTokens: 8_000,
    });
    parsed = response.value;
  } catch {
    throw new Error("AI could not read this question paper. Check that the PDF is legible or create the marking setup manually.");
  }

  const extracted = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  const rawQuestions = validateExtractedSchemePayload(extracted);
  const seenIds = new Map<string, number>();
  const questions: SchemeQuestion[] = [];
  rawQuestions.forEach((raw: unknown, index: number) => {
    if (!raw || typeof raw !== "object") return;
    const row = raw as Record<string, unknown>;
    const rawLabel = typeof row.label === "string" ? row.label.trim() : "";
    const rawIdSource = typeof row.id === "string" ? row.id.trim() : "";
    const rawMax = Number(row.maximumMarks);
    const hasPositiveMax = Number.isFinite(rawMax) && rawMax > 0;
    // A zero-mark row is not a gradeable question. Accepting one previously
    // allowed a provider refusal ("PDF not attached") to overwrite a valid
    // 80-mark setup with a fake 0-mark scheme.
    if (!hasPositiveMax) return;

    const baseId = rawIdSource || `Q${index + 1}`;
    const seenCount = seenIds.get(baseId) ?? 0;
    const id = seenCount > 0 ? `${baseId}-${seenCount + 1}` : baseId;
    seenIds.set(baseId, seenCount + 1);

    const keyPoints = Array.isArray(row.keyPoints)
      ? row.keyPoints
          .filter(
            (point): point is string =>
              typeof point === "string" && point.trim().length > 0
          )
          .map(point => point.trim())
      : [];

    questions.push({
      id,
      label: rawLabel || id,
      maximumMarks: hasPositiveMax ? Math.round(rawMax) : 0,
      keyPoints,
    });
  });

  if (questions.length === 0) {
    throw new Error(
      "Could not read any questions from this paper — check the PDF is a real, legible question paper, or add the scheme manually in Teacher setup."
    );
  }

  const summedTotal = questions.reduce(
    (sum, question) => sum + question.maximumMarks,
    0
  );
  const printedTotalRaw = Number(extracted.printedMaximumMarks);
  const printedMaximumMarks =
    Number.isFinite(printedTotalRaw) && printedTotalRaw > 0
      ? Math.round(printedTotalRaw)
      : undefined;
  // Mirrors resolveDenominator's honest-denominator preference above: a printed
  // total is authoritative over a derived one, but only when it is plausible next
  // to what was actually transcribed - a wildly different number signals a bad
  // extraction, not a real disagreement, so fall back to the summed total instead.
  const tolerance = Math.max(10, Math.round(summedTotal * 0.25));
  const maximumMarks =
    printedMaximumMarks !== undefined &&
    (summedTotal === 0 ||
      Math.abs(printedMaximumMarks - summedTotal) <= tolerance)
      ? printedMaximumMarks
      : summedTotal > 0
        ? summedTotal
        : (printedMaximumMarks ?? 0);

  const paperTitle =
    typeof extracted.paperTitle === "string" ? extracted.paperTitle.trim() : "";

  return {
    paperTitle,
    printedMaximumMarks: printedMaximumMarks ?? null,
    maximumMarks,
    questions,
    questionCount: questions.length,
  };
}

export function clampScore(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.round(value)));
}

export function requiresDeviation(humanMarks: number, aiMarks: number) {
  return Math.abs(humanMarks - aiMarks) >= 3;
}

export function extractContent(response: any): string {
  const value = response?.choices?.[0]?.message?.content;
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map((item: any) => item?.text ?? "").join("");
  return "";
}

// Some ScaleMax-routed models wrap their JSON reply in a markdown code fence
// (```json ... ```) even with response_format: json_object set - confirmed by
// direct testing against claude-sonnet-5. Strip a wrapping fence, if present,
// before parsing so a real, well-formed response is not treated as a failure.
export function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

export function validateExtractedSchemePayload(payload: unknown): unknown[] {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const questions = Array.isArray(source.questions) ? source.questions : [];
  const responseText = JSON.stringify(source).toLowerCase();
  const attachmentRefusal = [
    /pdf\s+(?:is\s+)?not\s+attached/,
    /(?:file|document)\s+(?:is\s+)?not\s+attached/,
    /(?:cannot|can't|unable to)\s+(?:access|open|read|see)\s+(?:the\s+)?(?:pdf|file|document|paper)/,
    /no\s+(?:pdf|file|document)\s+(?:was\s+)?(?:attached|provided|available)/,
  ].some(pattern => pattern.test(responseText));

  if (attachmentRefusal) {
    throw new Error(
      "AI did not receive the question-paper PDF. The existing marking setup was kept unchanged; retry or create the marking setup manually."
    );
  }
  if (!questions.length) {
    throw new Error(
      "The AI reader returned no gradeable questions from the attached paper."
    );
  }
  return questions;
}

export function normalizeGradePayload(
  payload: unknown,
  questions: SchemeQuestion[]
): { grades: Grade[]; coverageNote: string } {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawGrades = source.grades ?? source.evaluations;
  const candidates = Array.isArray(rawGrades)
    ? rawGrades
    : rawGrades && typeof rawGrades === "object"
      ? Object.entries(rawGrades as Record<string, unknown>).map(
          ([questionId, value]) => {
            if (value && typeof value === "object")
              return {
                ...(value as Record<string, unknown>),
                questionId:
                  (value as Record<string, unknown>).questionId ?? questionId,
              };
            return { questionId, marks: value };
          }
        )
      : [];
  const known = new Map(questions.map(question => [question.id, question]));
  const grades: Grade[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    const questionId =
      typeof row.questionId === "string"
        ? row.questionId
        : typeof row.question_id === "string"
          ? row.question_id
          : "";
    const question = known.get(questionId);
    const marks = Number(row.marks ?? row.awardedMarks ?? row.awarded_marks);
    if (!question || !Number.isFinite(marks)) continue;
    grades.push({
      questionId,
      marks: clampScore(marks, question.maximumMarks),
      feedback:
        typeof row.feedback === "string"
          ? row.feedback
          : typeof row.rationale === "string"
            ? row.rationale
            : "AI evaluation returned no written rationale.",
      confidence: clampScore(Number(row.confidence ?? 60), 100),
    });
  }

  if (grades.length === 0)
    throw new Error(
      "The AI response did not contain valid question IDs and awarded marks from the attached marking scheme."
    );
  return {
    grades,
    coverageNote:
      typeof source.coverageNote === "string"
        ? source.coverageNote
        : typeof source.coverage_note === "string"
          ? source.coverage_note
          : "AI evaluation completed with the available document coverage.",
  };
}

export function gradeFailureDetail(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unknown model or document error.";
}

function rejectRetiredBulkGrading(): void {
  throw new Error("Bulk AI grading is retired. Use question-level AI evaluation from the checking workspace.");
}

export async function runScaleMaxGrade(input: {
  bundleId: string;
  mode: "primary" | "second-reader";
}) {
  // Bulk grading is intentionally retired. The evaluator route performs
  // question-scoped evidence preparation and grading instead.
  rejectRetiredBulkGrading();

  const db = await getDb();
  if (!db) throw new Error("The Drishti database is unavailable.");
  const bundle = (
    await db
      .select()
      .from(bundles)
      .where(eq(bundles.id, input.bundleId))
      .limit(1)
  )[0];
  if (!bundle) throw new Error("Bundle not found.");
  if (!bundle.schemeId)
    throw new Error("Attach a marking scheme before AI evaluation.");
  if (!bundle.questionPaperKey || !bundle.bookletKey)
    throw new Error(
      "AI evaluation requires both a stored question paper and a stored answer booklet."
    );
  const scheme = (
    await db
      .select()
      .from(markingSchemes)
      .where(eq(markingSchemes.id, bundle.schemeId!))
      .limit(1)
  )[0];
  if (!scheme) throw new Error("Marking scheme not found.");
  const questions = scheme.questions as SchemeQuestion[];
  const generationId = nanoid(16);
  let model: string | undefined;
  let invoke: GradingInvoker;
  let provider = "Manus built-in document reader";
  const externalPdfQaEnabled = process.env.SCALEMAX_DOCUMENT_FILE_QA === "true";
  if (isScaleMaxConfigured() && externalPdfQaEnabled) {
    // This whole branch attaches documents (question paper + booklet), so it must
    // resolve a model verified to actually read them - see resolveScaleMaxDocumentModel's
    // comment in scalemax.ts for why the general resolver is not safe here.
    const selected = await resolveScaleMaxDocumentModel();
    model = selected.selected;
    invoke = invokeScaleMaxDocument;
    provider = "ScaleMax-compatible";
  } else {
    const { data: models } = await listLLMModels();
    model =
      models.find(m => m.id.startsWith("gemini-3.1"))?.id ??
      models.find(m => m.id.startsWith("gpt-5.5"))?.id ??
      models.find(m => m.id.startsWith("claude-opus"))?.id ??
      models[0]?.id;
    invoke = invokeLLM;
  }
  if (!model)
    throw new Error("No grading-capable model is currently available.");
  const useInlineFile = provider === "ScaleMax-compatible";
  const extractedTotal = bundle.printedMaximumMarks
    ? undefined
    : await extractPrintedMaximum(bundle, model, invoke, useInlineFile);
  if (extractedTotal)
    await db
      .update(bundles)
      .set({ printedMaximumMarks: extractedTotal, coverageComplete: true })
      .where(eq(bundles.id, bundle.id));
  const denominator = resolveDenominator(
    extractedTotal ? { ...bundle, printedMaximumMarks: extractedTotal } : bundle
  );
  await db
    .update(bundles)
    .set({ coverageComplete: denominator.coverageComplete })
    .where(eq(bundles.id, bundle.id));
  await db
    .update(bundles)
    .set({ status: "grading" })
    .where(and(eq(bundles.id, bundle.id), ne(bundles.status, "finalized")));

  await db.insert(generations).values({
    id: generationId,
    bundleId: bundle.id,
    provider,
    model,
    attempt: 1,
    status: "queued",
  });
  const documentParts: (FileContent | FilePayloadContent)[] = [];
  if (bundle.questionPaperKey)
    documentParts.push(
      await buildDocumentPart(bundle.questionPaperKey, useInlineFile)
    );
  if (bundle.bookletKey)
    documentParts.push(
      await buildDocumentPart(bundle.bookletKey, useInlineFile)
    );
  const prompt = `You are Drishti's ${input.mode === "second-reader" ? "independent second reader" : "primary evaluator"}. Evaluate strictly against the attached question paper and answer booklet using the marking scheme. Return JSON only in this exact shape: {"grades":[{"questionId":"Q1","marks":0,"feedback":"brief evidence-based rationale","confidence":0}],"coverageNote":"brief coverage note"}. Return only listed question IDs: ${questions.map(question => question.id).join(", ")}. Award whole-number marks only. Never exceed a question maximum. The total denominator is ${denominator.total} from ${denominator.source}; coverage complete: ${denominator.coverageComplete}. Marking scheme: ${JSON.stringify(questions)}.`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await invoke({
        model,
        messages: [
          {
            role: "system",
            content:
              "Produce a precise, defensible examination evaluation. Return JSON only.",
          },
          {
            role: "user",
            content: [{ type: "text", text: prompt }, ...documentParts],
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 4096,
      });
      const parsed = normalizeGradePayload(
        parseModelJson(extractContent(response)),
        questions
      );
      const completedModel = response.model || model;
      await db
        .update(generations)
        .set({
          status: "completed",
          model: completedModel,
          attempt,
          output: {
            grades: parsed.grades,
            coverageNote: parsed.coverageNote,
            denominator,
          },
        })
        .where(eq(generations.id, generationId));
      return {
        grades: parsed.grades,
        coverageNote: parsed.coverageNote,
        denominator,
        model: completedModel,
        generationId,
      };
    } catch (error) {
      lastError = error;
      await db
        .update(generations)
        .set({ attempt })
        .where(eq(generations.id, generationId));
    }
  }
  await db
    .update(generations)
    .set({ status: "failed", output: { message: String(lastError) } })
    .where(eq(generations.id, generationId));
  const detail = gradeFailureDetail(lastError);
  throw new Error(
    `ScaleMax grading did not complete after two controlled attempts. ${detail}`
  );
}

export async function persistAIGrades(
  input: { bundleId: string; mode: "primary" | "second-reader" },
  gradeRunner = runScaleMaxGrade
) {
  const result = await gradeRunner(input);
  const db = await getDb();
  if (!db) throw new Error("The Drishti database is unavailable.");
  const bundle = (
    await db
      .select()
      .from(bundles)
      .where(eq(bundles.id, input.bundleId))
      .limit(1)
  )[0];
  const scheme = bundle?.schemeId
    ? (
        await db
          .select()
          .from(markingSchemes)
          .where(eq(markingSchemes.id, bundle.schemeId))
          .limit(1)
      )[0]
    : undefined;
  const questions = (scheme?.questions ?? []) as SchemeQuestion[];
  for (const grade of result.grades) {
    const question = questions.find(item => item.id === grade.questionId);
    if (!question) continue;
    const existing = await db
      .select()
      .from(evaluations)
      .where(eq(evaluations.bundleId, input.bundleId));
    const row = existing.find(item => item.questionId === grade.questionId);
    const id = row?.id ?? nanoid(16);
    await db
      .insert(evaluations)
      .values({
        id,
        bundleId: input.bundleId,
        questionId: grade.questionId,
        questionLabel: question.label,
        schemeMaximum: question.maximumMarks,
        aiMarks: grade.marks,
        humanMarks: row?.humanMarks ?? null,
        feedback: grade.feedback,
        confidence: grade.confidence,
        pagesViewed: row?.pagesViewed ?? [],
        reviewedByRole: row?.reviewedByRole ?? null,
      })
      .onConflictDoUpdate({
        target: evaluations.id,
        set: {
          aiMarks: grade.marks,
          feedback: grade.feedback,
          confidence: grade.confidence,
        },
      });
    const humanMarks = row?.humanMarks;
    if (
      humanMarks !== null &&
      humanMarks !== undefined &&
      requiresDeviation(humanMarks, grade.marks)
    ) {
      const existingDeviation = (
        await db
          .select()
          .from(deviations)
          .where(eq(deviations.evaluationId, id))
          .limit(1)
      )[0];
      if (!existingDeviation)
        await db.insert(deviations).values({
          id: nanoid(16),
          bundleId: input.bundleId,
          evaluationId: id,
          delta: Math.abs(humanMarks - grade.marks),
        });
    }
  }
  await db
    .update(bundles)
    .set({ status: "review" })
    .where(
      and(eq(bundles.id, input.bundleId), ne(bundles.status, "finalized"))
    );
  return result;
}
