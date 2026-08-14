import { trpc } from "@/lib/trpc";
import { ArrowRight, FileStack, History as HistoryIcon } from "lucide-react";
import { Link } from "wouter";

export default function History() {
  const bundles = trpc.bundles.list.useQuery();
  return (
    <div className="teacher-readable mx-auto max-w-6xl">
      <p className="mono-label text-[#7c5e10]">Record archive</p>
      <h1 className="mt-2 font-display text-5xl">
        Past booklets and marking records.
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-[#57534e]">
        Select any record to reopen its booklet pages, questions, and saved
        marks.
      </p>
      <div className="panel mt-8 overflow-hidden rounded-3xl">
        {bundles.data?.length ? (
          <div className="divide-y divide-[#eeeae4]">
            {bundles.data.map(bundle => (
              <Link
                key={bundle.id}
                href={`/dashboard/marking?bundle=${bundle.id}`}
                className="press flex flex-wrap items-center gap-4 p-5 hover:bg-[#fdfcfb]"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f7f1e3] text-[#7c5e10]">
                  <FileStack size={18} />
                </span>
                <div className="min-w-48 flex-1">
                  <p className="text-sm font-semibold">
                    {bundle.candidateName}
                  </p>
                  <p className="mt-1 mono-label text-[#a8a29e]">
                    {bundle.subject}
                  </p>
                </div>
                <span className="text-xs text-[#78716c]">
                  {new Date(bundle.updatedAt).toLocaleString()}
                </span>
                <span className="rounded-full bg-[#f5f3ef] px-2.5 py-1 mono-label text-[#78716c]">
                  {bundle.status}
                </span>
                <ArrowRight size={16} className="text-[#c8c2b8]" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center text-center">
            <div>
              <HistoryIcon className="mx-auto text-[#c5a45c]" />
              <p className="mt-4 text-sm font-medium">
                There is no bundle history yet.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
