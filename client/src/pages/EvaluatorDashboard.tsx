import { trpc } from "@/lib/trpc";
import { ArrowRight, ClipboardCheck, FileStack, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function EvaluatorDashboard() {
  const papers = trpc.evaluator.assignedPapers.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Evaluator workspace</p>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mt-2 font-display text-5xl">Your Assigned Papers</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
            Only papers assigned to this authenticated evaluator account are shown here.
          </p>
        </div>
        <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 mono-label text-[#2f6f95]">
          {papers.data?.length ?? 0} assigned
        </span>
      </div>
      <section className="panel mt-8 overflow-hidden rounded-3xl">
        {papers.isLoading ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <Loader2 className="mx-auto animate-spin text-[#2f6f95]" />
              <p className="mt-3 text-sm text-[#6b8190]">Loading assigned papers.</p>
            </div>
          </div>
        ) : papers.isError ? (
          <div className="p-8 text-sm text-[#6b8190]">
            Assigned papers could not be loaded. Refresh to try again.
          </div>
        ) : papers.data?.length ? (
          <div className="divide-y divide-[#e3f0f6]">
            {papers.data.map(paper => (
              <article
                key={paper.id}
                className="flex flex-wrap items-center gap-4 px-6 py-5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
                  <FileStack size={17} />
                </span>
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-semibold">{paper.candidateName}</p>
                  <p className="mt-1 mono-label text-[#7f9aaa]">
                    {paper.subject} · {paper.pageCount} pages · assigned {new Date(paper.assignedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-[#eef7fc] px-2.5 py-1 mono-label text-[#6b8190]">
                  {paper.status}
                </span>
                <Link
                  href={`/evaluator/checking/${paper.id}`}
                  className="press flex items-center gap-2 rounded-xl bg-[#2f6f95] px-3.5 py-2.5 text-xs font-semibold text-white"
                >
                  {paper.processingState === "submitted"
                    ? "View"
                    : "START CHECKING"}
                  <ArrowRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <ClipboardCheck className="mx-auto text-[#75afd0]" />
              <p className="mt-4 text-sm font-medium">
                No papers assigned yet.
              </p>
              <p className="mt-2 text-xs leading-5 text-[#6b8190]">
                Your assigned papers will appear here when the center assigns them.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
