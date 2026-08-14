import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { SchemeQuestion } from "@shared/drishti";
import { trpc } from "@/lib/trpc";
import { renderStoredPdfPage } from "@/lib/pdf";

function PdfEvidence({
  sourceUrl,
  fallbackUrl,
  page,
  zoom,
}: {
  sourceUrl: string | null | undefined;
  fallbackUrl: string | null | undefined;
  page: number;
  zoom: number;
}) {
  const [src, setSrc] = useState<string | null>(fallbackUrl ?? null);
  const [loading, setLoading] = useState(Boolean(sourceUrl));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    setLoading(Boolean(sourceUrl));
    setSrc(sourceUrl ? null : (fallbackUrl ?? null));
    if (!sourceUrl)
      return () => {
        active = false;
      };
    renderStoredPdfPage(sourceUrl, page)
      .then(value => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (!active) return;
        setSrc(fallbackUrl ?? null);
        setError(
          fallbackUrl
            ? "The source PDF could not be opened, so this page is using the stored evidence render."
            : "The source PDF could not be opened. Restore the booklet file before marking."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fallbackUrl, page, sourceUrl]);

  if (loading && !src)
    return (
      <div className="grid min-h-full place-items-center bg-[#efede8]">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-[#7c5e10]" size={22} />
          <p className="mt-3 text-xs font-medium text-[#78716c]">
            Rendering full-resolution PDF page…
          </p>
        </div>
      </div>
    );

  if (!src)
    return (
      <div className="grid min-h-full place-items-center bg-[#efede8] px-8 text-center">
        <div>
          <AlertCircle className="mx-auto text-[#b45309]" size={24} />
          <p className="mt-3 text-sm font-semibold">
            Booklet evidence is unavailable.
          </p>
          <p className="mt-1 text-xs leading-5 text-[#78716c]">
            Restore the stored answer-booklet PDF or re-upload this bundle.
          </p>
        </div>
      </div>
    );

  return (
    <div className="relative min-h-full min-w-full">
      {error ? (
        <div className="sticky left-3 top-3 z-10 mb-[-44px] w-fit max-w-[calc(100%-24px)] rounded-lg border border-[#eadcae] bg-[#fff9e8]/95 px-3 py-2 text-[11px] text-[#7c5e10] shadow-sm backdrop-blur">
          {error}
        </div>
      ) : null}
      <div className="flex min-h-full min-w-full items-start justify-center p-4 sm:p-6">
        <img
          src={src}
          alt={`Rendered answer booklet page ${page}`}
          style={{ width: `${zoom}%` }}
          className="h-auto max-w-none rounded-md bg-white shadow-[0_18px_55px_-28px_rgba(28,25,23,.45)]"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${accent ? "border-[#eadcae] bg-[#f8f2e5]" : "border-[#e7e4df] bg-white"}`}
    >
      <p
        className={`mono-label ${accent ? "text-[#7c5e10]" : "text-[#a8a29e]"}`}
      >
        {label}
      </p>
      <p className="mt-2 truncate text-lg font-semibold tabular-nums">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 truncate text-[11px] text-[#78716c]">{detail}</p>
      ) : null}
    </div>
  );
}

export default function Marking() {
  const initialBundle =
    new URLSearchParams(window.location.search).get("bundle") ?? "";
  const [bundleId, setBundleId] = useState(initialBundle);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [humanMark, setHumanMark] = useState<number | "">("");
  const [visitedPages, setVisitedPages] = useState<Record<string, number[]>>(
    {}
  );
  const bundles = trpc.bundles.list.useQuery();
  const detail = trpc.bundles.get.useQuery(
    { id: bundleId },
    { enabled: Boolean(bundleId) }
  );
  const save = trpc.marking.save.useMutation({
    onSuccess: result => {
      toast.success(`Teacher mark saved at ${result.humanMarks ?? 0} marks.`);
      detail.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const ai = trpc.marking.aiGrade.useMutation({
    onSuccess: result => {
      toast.success(`AI evaluation saved by ${result.model}.`);
      detail.refetch();
    },
    onError: error => toast.error(error.message),
  });
  const extractScheme = trpc.bundles.extractScheme.useMutation({
    onSuccess: () => {
      toast.success("Questions and marks read from the stored paper.");
      detail.refetch();
    },
    onError: error => toast.error(error.message),
  });

  const rawQuestions = (detail.data?.scheme?.questions ??
    []) as SchemeQuestion[];
  const questions = useMemo(
    () =>
      rawQuestions.filter(
        item =>
          item.maximumMarks > 0 &&
          !/pdf not attached|unable to read the paper/i.test(
            `${item.id} ${item.label}`
          )
      ),
    [rawQuestions]
  );
  const rejectedScheme = rawQuestions.length > 0 && questions.length === 0;
  const question = questions[questionIndex];
  const evaluation = useMemo(
    () =>
      detail.data?.evaluations.find(item => item.questionId === question?.id),
    [detail.data?.evaluations, question?.id]
  );
  const pages = detail.data?.pages ?? [];
  const currentPage = pages.find(item => item.pageNumber === page);
  const latestModel = detail.data?.latestGeneration?.model ?? "Opus / Sonnet";
  const humanTotal = (detail.data?.evaluations ?? []).reduce(
    (sum, item) => sum + (item.humanMarks ?? 0),
    0
  );
  const aiTotal = (detail.data?.evaluations ?? []).reduce(
    (sum, item) => sum + (item.aiMarks ?? 0),
    0
  );
  const markedCount = (detail.data?.evaluations ?? []).filter(
    item => item.humanMarks !== null
  ).length;

  useEffect(() => {
    setQuestionIndex(0);
    setPage(1);
    setZoom(100);
    setVisitedPages({});
  }, [bundleId]);

  useEffect(() => {
    if (questionIndex >= questions.length) setQuestionIndex(0);
  }, [questionIndex, questions.length]);

  useEffect(() => {
    setHumanMark(evaluation?.humanMarks ?? "");
    if (question)
      setVisitedPages(current => ({
        ...current,
        [question.id]: Array.from(
          new Set([
            ...(current[question.id] ?? []),
            ...((evaluation?.pagesViewed as number[] | null) ?? []),
            page,
          ])
        ).sort((a, b) => a - b),
      }));
  }, [evaluation?.id, evaluation?.humanMarks, question?.id, page]);

  const visitPage = (target: number) => {
    const safe = Math.max(
      1,
      Math.min(detail.data?.bundle.pageCount ?? 1, target)
    );
    setPage(safe);
    if (question)
      setVisitedPages(current => ({
        ...current,
        [question.id]: Array.from(
          new Set([...(current[question.id] ?? []), safe])
        ).sort((a, b) => a - b),
      }));
  };

  const persist = () => {
    if (!detail.data || !question) return;
    const requested = humanMark === "" ? null : Number(humanMark);
    const allViewed = Array.from(
      new Set([
        ...(visitedPages[question.id] ?? []),
        ...((evaluation?.pagesViewed as number[] | null) ?? []),
        page,
      ])
    ).sort((a, b) => a - b);
    save.mutate({
      id: evaluation?.id,
      bundleId,
      questionId: question.id,
      questionLabel: question.label,
      schemeMaximum: question.maximumMarks,
      humanMarks: requested,
      pagesViewed: allViewed,
    });
  };

  if (!bundles.data?.length)
    return (
      <div className="panel grid min-h-[430px] place-items-center rounded-3xl p-8 text-center">
        <div>
          <FileText className="mx-auto text-[#c5a45c]" />
          <h1 className="mt-5 font-display text-5xl">
            Marking starts with an intake bundle.
          </h1>
          <p className="mt-3 text-sm text-[#78716c]">
            Upload the booklet and its matching question paper first.
          </p>
        </div>
      </div>
    );

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mono-label text-[#7c5e10]">02 · Teacher marking desk</p>
          <h1 className="mt-2 max-w-3xl font-display text-5xl leading-[.95] tracking-[-.02em]">
            See the paper clearly. Award every mark.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#78716c]">
            Full-resolution booklet evidence, exact paper maxima, and an
            independent AI reading in one review surface.
          </p>
        </div>
        <select
          value={bundleId}
          onChange={event => setBundleId(event.target.value)}
          className="h-11 min-w-72 rounded-xl border border-[#e7e4df] bg-white px-3 text-sm outline-none transition focus:border-[#c5a45c] focus:ring-2 focus:ring-[#e6c075]/20"
        >
          <option value="">Choose booklet</option>
          {bundles.data.map(bundle => (
            <option key={bundle.id} value={bundle.id}>
              {bundle.candidateName} · {bundle.subject}
            </option>
          ))}
        </select>
      </div>

      {!bundleId ? (
        <div className="panel mt-8 rounded-3xl p-10 text-sm text-[#78716c]">
          Select an answer booklet to open its full-resolution pages and marking
          controls.
        </div>
      ) : detail.isLoading ? (
        <div className="grid min-h-96 place-items-center">
          <Loader2 className="animate-spin text-[#7c5e10]" />
        </div>
      ) : detail.isError ? (
        <div className="mt-8 rounded-3xl border border-[#efc5bd] bg-[#fff7f5] p-8">
          <AlertCircle className="text-[#c0392b]" />
          <h2 className="mt-4 font-display text-3xl">
            This booklet could not be opened.
          </h2>
          <p className="mt-2 text-sm text-[#78716c]">{detail.error.message}</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Paper total"
              value={`${detail.data?.denominator.total ?? 0} marks`}
              detail={`Source · ${detail.data?.denominator.source ?? "unknown"}`}
              accent
            />
            <Stat
              label="AI reader"
              value={latestModel}
              detail={
                detail.data?.latestGeneration?.status ??
                "Ready for verified document reading"
              }
            />
            <Stat
              label="Evidence pages"
              value={`${pages.length} / ${detail.data?.bundle.pageCount ?? 0}`}
              detail={`${markedCount} of ${questions.length} questions marked`}
            />
            <Stat
              label="Booklet integrity"
              value={
                detail.data?.documentIntegrity.hasAnswerBooklet
                  ? "Source present"
                  : "Source missing"
              }
              detail={
                detail.data?.documentIntegrity.hasQuestionPaper
                  ? "Question paper linked"
                  : "Question paper missing"
              }
            />
          </div>

          <div className="mt-5 grid overflow-hidden rounded-[28px] border border-[#ddd8cf] bg-white shadow-[0_24px_70px_-45px_rgba(28,25,23,.35)] lg:grid-cols-[1.16fr_.84fr]">
            <section className="min-w-0 border-b border-[#e7e4df] lg:border-b-0 lg:border-r">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7e4df] px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="mono-label text-[#7c5e10]">
                      Booklet evidence
                    </p>
                    <span className="h-1 w-1 rounded-full bg-[#16803d]" />
                  </div>
                  <p className="mt-1 text-sm font-semibold">
                    Page {page} of {detail.data?.bundle.pageCount ?? 1}
                  </p>
                  {question ? (
                    <p className="mt-1 max-w-md truncate text-xs text-[#78716c]">
                      Evidence viewed for {question.id}:{" "}
                      {(visitedPages[question.id] ?? []).join(", ") || page}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-label="Previous page"
                    onClick={() => visitPage(page - 1)}
                    disabled={page <= 1}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#e7e4df] disabled:opacity-35"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    aria-label="Next page"
                    onClick={() => visitPage(page + 1)}
                    disabled={page >= (detail.data?.bundle.pageCount ?? 1)}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#e7e4df] disabled:opacity-35"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <span className="mx-1 h-5 w-px bg-[#e7e4df]" />
                  <button
                    aria-label="Zoom out"
                    onClick={() => setZoom(value => Math.max(75, value - 25))}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#e7e4df]"
                  >
                    <ZoomOut size={15} />
                  </button>
                  <button
                    onClick={() => setZoom(100)}
                    className="press h-9 min-w-14 rounded-lg border border-[#e7e4df] px-2 font-mono text-[10px] tabular-nums"
                  >
                    {zoom}%
                  </button>
                  <button
                    aria-label="Zoom in"
                    onClick={() => setZoom(value => Math.min(200, value + 25))}
                    className="press grid h-9 w-9 place-items-center rounded-lg border border-[#e7e4df]"
                  >
                    <ZoomIn size={15} />
                  </button>
                  {detail.data?.bundle.bookletUrl ? (
                    <a
                      aria-label="Open source PDF"
                      href={detail.data.bundle.bookletUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="press grid h-9 w-9 place-items-center rounded-lg bg-[#1c1917] text-white"
                    >
                      <ExternalLink size={15} />
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="h-[clamp(520px,68vh,760px)] overflow-auto bg-[#ebe9e4]">
                <PdfEvidence
                  sourceUrl={detail.data?.bundle.bookletUrl}
                  fallbackUrl={currentPage?.pageDataUrl}
                  page={page}
                  zoom={zoom}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto border-t border-[#e7e4df] bg-[#fbfaf8] p-3">
                {pages.map(item => (
                  <button
                    key={item.pageNumber}
                    onClick={() => visitPage(item.pageNumber)}
                    className={`group relative w-24 shrink-0 overflow-hidden rounded-xl border bg-white p-1.5 text-left transition ${page === item.pageNumber ? "border-[#7c5e10] ring-2 ring-[#e6c075]/35" : "border-[#e7e4df] hover:border-[#c5a45c]"}`}
                  >
                    <img
                      src={item.pageDataUrl ?? ""}
                      alt={`Thumbnail for page ${item.pageNumber}`}
                      className="h-16 w-full rounded-md bg-[#f3f1ec] object-cover object-top"
                    />
                    <span className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-[#78716c]">
                      <span>PAGE {item.pageNumber}</span>
                      <span
                        className={
                          item.clarity === "CLEAR"
                            ? "text-[#16803d]"
                            : "text-[#b45309]"
                        }
                      >
                        {item.clarity}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="flex min-h-[700px] min-w-0 flex-col p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="mono-label text-[#7c5e10]">Teacher marks</p>
                  <h2 className="mt-1 truncate font-display text-3xl">
                    {question?.label ??
                      (rejectedScheme
                        ? "Paper read needs repair"
                        : "Add questions and marks")}
                  </h2>
                </div>
                {questions.length ? (
                  <button
                    onClick={() => ai.mutate({ bundleId, secondReader: false })}
                    disabled={ai.isPending}
                    className="press flex shrink-0 items-center gap-1.5 rounded-full bg-[#1c1917] px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {ai.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    AI grade
                  </button>
                ) : null}
              </div>

              {question ? (
                <>
                  <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
                    {questions.map((item, index) => (
                      <button
                        key={item.id}
                        onClick={() => setQuestionIndex(index)}
                        className={`press shrink-0 rounded-lg border px-3 py-2 font-mono text-[10px] font-semibold tracking-[.08em] ${questionIndex === index ? "border-[#d8bc72] bg-[#f7f1e3] text-[#7c5e10]" : "border-[#e7e4df] bg-white text-[#78716c] hover:border-[#d8bc72]"}`}
                      >
                        {item.id}{" "}
                        <span className="opacity-55">
                          / {item.maximumMarks}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-4 rounded-2xl bg-[#f8f6f1] p-5">
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <p className="mono-label text-[#a8a29e]">
                          Question maximum
                        </p>
                        <p className="mt-2 font-display text-5xl tabular-nums">
                          {question.maximumMarks}
                          <span className="ml-1 text-lg text-[#78716c]">
                            marks
                          </span>
                        </p>
                      </div>
                      <span className="rounded-full border border-[#d7eadc] bg-[#eef8f1] px-3 py-1.5 font-mono text-[9px] text-[#16803d]">
                        <ShieldCheck className="mr-1 inline" size={12} />
                        SCHEME VERIFIED
                      </span>
                    </div>
                    {question.keyPoints.length ? (
                      <div className="mt-4 border-t border-[#e7e4df] pt-3">
                        <p className="mono-label text-[#7c5e10]">
                          Reference points
                        </p>
                        <p className="mt-2 text-xs leading-5 text-[#57534e]">
                          {question.keyPoints.join(" · ")}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[#e7e4df] p-4">
                      <p className="mono-label text-[#a8a29e]">AI mark</p>
                      <p className="mt-3 font-display text-4xl tabular-nums">
                        {evaluation?.aiMarks ?? "—"}
                        <span className="ml-1 text-base text-[#a8a29e]">
                          / {question.maximumMarks}
                        </span>
                      </p>
                      <p className="mt-2 line-clamp-4 text-xs leading-5 text-[#78716c]">
                        {evaluation?.feedback ??
                          "Run the verified AI reader for evidence-based feedback."}
                      </p>
                      {evaluation?.confidence !== null &&
                      evaluation?.confidence !== undefined ? (
                        <p className="mt-3 border-t border-[#eeeae3] pt-2 font-mono text-[9px] text-[#7c5e10]">
                          CONFIDENCE {evaluation.confidence}%
                        </p>
                      ) : null}
                    </div>
                    <label className="rounded-2xl border border-[#e7e4df] p-4">
                      <span className="mono-label text-[#a8a29e]">
                        Award mark
                      </span>
                      <input
                        aria-label={`Award mark for ${question.id}`}
                        type="number"
                        min="0"
                        max={question.maximumMarks}
                        value={humanMark}
                        onChange={event =>
                          setHumanMark(
                            event.target.value === ""
                              ? ""
                              : Math.min(
                                  question.maximumMarks,
                                  Math.max(0, Number(event.target.value))
                                )
                          )
                        }
                        className="mt-2 w-full border-b border-[#d9d3c9] bg-transparent font-display text-4xl outline-none transition focus:border-[#c5a45c]"
                      />
                      <span className="mt-2 block text-xs text-[#78716c]">
                        Maximum: {question.maximumMarks} marks.
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={persist}
                    disabled={save.isPending}
                    className="press mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#1c1917] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {save.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Save mark for {question.id}
                  </button>
                  <button
                    onClick={() => ai.mutate({ bundleId, secondReader: true })}
                    disabled={ai.isPending}
                    className="press mt-3 flex items-center justify-center gap-2 rounded-xl border border-[#eadcae] bg-[#faf5e9] px-4 py-3 text-sm font-semibold text-[#7c5e10] disabled:opacity-50"
                  >
                    <Bot size={16} />
                    Request independent second read
                  </button>

                  <div className="mt-auto pt-6">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#78716c]">
                        Teacher total{" "}
                        <strong className="text-[#1c1917]">{humanTotal}</strong>
                      </span>
                      <span className="text-[#78716c]">
                        AI total{" "}
                        <strong className="text-[#1c1917]">{aiTotal}</strong>
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#eeeae3]">
                      <div
                        className="h-full rounded-full bg-[#c5a45c] transition-all"
                        style={{
                          width: `${questions.length ? Math.min(100, (markedCount / questions.length) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-[#78716c]">
                      {detail.data?.denominator.note}
                    </p>
                  </div>
                </>
              ) : (
                <div className="grid flex-1 place-items-center px-4 text-center">
                  <div className="max-w-sm">
                    <AlertCircle className="mx-auto text-[#b45309]" size={25} />
                    <h3 className="mt-4 font-display text-3xl">
                      {rejectedScheme
                        ? "The previous AI read was rejected."
                        : "No marking setup is attached."}
                    </h3>
                    <p className="mt-3 text-sm leading-6 text-[#78716c]">
                      {rejectedScheme
                        ? "A provider refusal cannot become a zero-mark question. The stored paper is still available and can be read again with a verified Opus or Sonnet document model."
                        : detail.data?.bundle.questionPaperKey
                          ? "The question paper is stored. Read its exact questions and maxima before grading."
                          : "Restore or upload the matching question paper before using AI grading."}
                    </p>
                    {detail.data?.bundle.questionPaperKey ? (
                      <button
                        onClick={() => extractScheme.mutate({ bundleId })}
                        disabled={extractScheme.isPending}
                        className="press mx-auto mt-5 flex items-center justify-center gap-2 rounded-full bg-[#1c1917] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {extractScheme.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        Read paper with verified AI
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
