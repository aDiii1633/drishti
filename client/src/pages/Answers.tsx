import { trpc } from "@/lib/trpc";
import { FileText, FolderOpen, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function Answers() {
  const bundles = trpc.bundles.list.useQuery();
  const [bundleId, setBundleId] = useState("");
  const detail = trpc.bundles.get.useQuery(
    { id: bundleId },
    { enabled: Boolean(bundleId) }
  );
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Evidence artifacts</p>
      <h1 className="mt-2 font-display text-5xl">Answer-booklet documents.</h1>
      <div className="mt-7 max-w-md">
        <select
          value={bundleId}
          onChange={event => setBundleId(event.target.value)}
          className="h-11 w-full rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm"
        >
          <option value="">Choose a bundle</option>
          {bundles.data?.map(bundle => (
            <option key={bundle.id} value={bundle.id}>
              {bundle.candidateName} · {bundle.subject}
            </option>
          ))}
        </select>
      </div>
      {detail.isLoading ? (
        <Loader2 className="mt-10 animate-spin text-[#2f6f95]" />
      ) : detail.data ? (
        <div className="mt-7 grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
          <aside className="panel rounded-3xl p-6">
            <p className="mono-label text-[#2f6f95]">Integrity check</p>
            <div className="mt-6 space-y-4">
              {[
                [
                  "Question paper",
                  detail.data.documentIntegrity.hasQuestionPaper,
                ],
                [
                  "Answer booklet",
                  detail.data.documentIntegrity.hasAnswerBooklet,
                ],
                ["Final PDF", detail.data.documentIntegrity.hasFinalPdf],
              ].map(([label, ok]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm">{String(label)}</span>
                  <span
                    className={`flex items-center gap-1 mono-label ${ok ? "text-[#2f7898]" : "text-[#b64c40]"}`}
                  >
                    <ShieldCheck size={13} />
                    {ok ? "Present" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </aside>
          <section className="grid gap-3 sm:grid-cols-2">
            {detail.data.documents.map(document => (
              <a
                key={document.id}
                href={document.storageUrl}
                target="_blank"
                rel="noreferrer"
                className="press rounded-2xl border border-[#d9eaf3] bg-white p-5 hover:border-[#8fc7e8]"
              >
                <FolderOpen className="text-[#2f6f95]" size={19} />
                <p className="mt-6 text-sm font-semibold">
                  {document.fileName}
                </p>
                <p className="mt-2 mono-label text-[#7f9aaa]">
                  {document.artifactType}
                  {document.pageNumber ? ` · page ${document.pageNumber}` : ""}
                </p>
                <div className="mt-5 flex items-center gap-1 text-xs font-semibold text-[#2f6f95]">
                  Open document <FileText size={14} />
                </div>
              </a>
            ))}
          </section>
        </div>
      ) : (
        <div className="panel mt-7 grid min-h-64 place-items-center rounded-3xl">
          <p className="text-sm text-[#6b8190]">
            Choose a bundle to inspect its saved artifacts.
          </p>
        </div>
      )}
    </div>
  );
}
