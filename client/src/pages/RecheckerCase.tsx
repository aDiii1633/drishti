import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Gavel, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

export default function RecheckerCase() {
  const [, params] = useRoute("/rechecker/case/:id");
  const id = params?.id ?? "";
  const detail = trpc.deviations.get.useQuery({ id }, { enabled: Boolean(id) });
  const [marks, setMarks] = useState<number | "">("");
  const [note, setNote] = useState("");
  const submit = trpc.deviations.submitRecheck.useMutation({
    onSuccess: () => {
      toast.success("Re-check submitted.");
      detail.refetch();
    },
    onError: error => toast.error(error.message),
  });
  if (detail.isLoading)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#2f6f95]" />
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="panel p-8 text-sm text-[#b64c40]">
        {detail.error?.message ?? "This re-check case is unavailable."}
      </div>
    );
  const { row, bundle, evaluation, question } = detail.data;
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/rechecker"
        className="press flex w-fit items-center gap-2 text-sm text-[#6b8190]"
      >
        <ArrowLeft size={16} />
        Assigned re-checks
      </Link>
      <p className="mono-label mt-8 text-[#2f6f95]">Re-check case</p>
      <h1 className="mt-2 font-display text-5xl">
        Review the original evaluation.
      </h1>
      <p className="mt-3 text-sm text-[#6b8190]">
        Bundle {bundle.id} · {bundle.subject} · {bundle.pageCount} pages
      </p>
      <div className="mt-8 grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center gap-2 text-[#2f6f95]">
            <Gavel size={17} />
            <span className="mono-label">Original record</span>
          </div>
          <h2 className="mt-5 text-xl font-semibold">
            {question?.label ??
              evaluation?.questionLabel ??
              "Question unavailable"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#6b8190]">
            {question?.keyPoints?.join(" · ") ||
              "No rubric notes were stored for this question."}
          </p>
          <div className="mt-7 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#d9eaf3] p-4">
              <p className="mono-label text-[#7f9aaa]">Original score</p>
              <p className="mt-2 font-display text-4xl">
                {evaluation?.humanMarks ?? "—"}
                <span className="ml-1 text-base text-[#7f9aaa]">
                  / {evaluation?.schemeMaximum ?? "—"}
                </span>
              </p>
            </div>
            <div className="rounded-2xl border border-[#d9eaf3] p-4">
              <p className="mono-label text-[#7f9aaa]">AI score</p>
              <p className="mt-2 font-display text-4xl">
                {evaluation?.aiMarks ?? "—"}
                <span className="ml-1 text-base text-[#7f9aaa]">
                  / {evaluation?.schemeMaximum ?? "—"}
                </span>
              </p>
            </div>
          </div>
          <p className="mt-5 rounded-xl bg-[#eef7fc] p-4 text-xs leading-5 text-[#587181]">
            {evaluation?.feedback || "No previous evaluator note was stored."}
          </p>
        </section>
        <section className="panel rounded-3xl p-6">
          <p className="mono-label text-[#2f6f95]">Re-check decision</p>
          <h2 className="mt-2 font-display text-3xl">
            Submit the reviewed score.
          </h2>
          <label className="mt-7 block">
            <span className="mono-label text-[#6b8190]">Re-check mark</span>
            <input
              type="number"
              min="0"
              max={evaluation?.schemeMaximum ?? 0}
              value={marks}
              onChange={event =>
                setMarks(
                  event.target.value === "" ? "" : Number(event.target.value)
                )
              }
              className="mt-2 h-12 w-full rounded-xl border border-[#d9eaf3] px-3 text-lg outline-none focus:border-[#75afd0]"
            />
          </label>
          <label className="mt-5 block">
            <span className="mono-label text-[#6b8190]">Review note</span>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              className="mt-2 min-h-32 w-full rounded-xl border border-[#d9eaf3] p-3 text-sm outline-none focus:border-[#75afd0]"
              placeholder="Explain the re-check decision"
            />
          </label>
          <button
            disabled={
              submit.isPending ||
              marks === "" ||
              !note.trim() ||
              row.status !== "open"
            }
            onClick={() => submit.mutate({ id, marks: Number(marks), note })}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163044] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            {submit.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Submit re-check
          </button>
        </section>
      </div>
    </div>
  );
}
