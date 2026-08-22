import { trpc } from "@/lib/trpc";
import { Bot, UserRound } from "lucide-react";
import { useState } from "react";

export default function Evaluations() {
  const bundles = trpc.bundles.list.useQuery();
  const [bundleId, setBundleId] = useState("");
  const detail = trpc.bundles.get.useQuery(
    { id: bundleId },
    { enabled: Boolean(bundleId) }
  );
  return (
    <div className="teacher-readable mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Scoring register</p>
      <h1 className="mt-2 font-display text-5xl">
        Compare teacher and AI marks.
      </h1>
      <select
        value={bundleId}
        onChange={event => setBundleId(event.target.value)}
        className="mt-7 h-11 w-full max-w-sm rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm"
      >
        <option value="">Choose a bundle</option>
        {bundles.data?.map(bundle => (
          <option key={bundle.id} value={bundle.id}>
            {bundle.candidateName} · {bundle.subject}
          </option>
        ))}
      </select>
      {detail.data && (
        <div className="panel mt-7 overflow-x-auto rounded-3xl">
          <div className="grid min-w-[560px] grid-cols-[1.2fr_.5fr_.5fr_.8fr] gap-3 border-b border-[#d9eaf3] px-5 py-4 mono-label text-[#7f9aaa]">
            <span>Question</span>
            <span>
              <Bot size={13} className="inline" /> AI
            </span>
            <span>
              <UserRound size={13} className="inline" /> Human
            </span>
            <span>Status</span>
          </div>
          {detail.data.evaluations.length ? (
            detail.data.evaluations.map(row => {
              const delta =
                row.humanMarks !== null && row.aiMarks !== null
                  ? Math.abs(row.humanMarks - row.aiMarks)
                  : 0;
              return (
                <div
                  key={row.id}
                  className="grid min-w-[560px] grid-cols-[1.2fr_.5fr_.5fr_.8fr] gap-3 border-b border-[#e3f0f6] px-5 py-4 text-sm"
                >
                  <div>
                    <p className="font-semibold">{row.questionLabel}</p>
                    <p className="mt-1 text-xs text-[#6b8190]">
                      Maximum {row.schemeMaximum}
                    </p>
                  </div>
                  <span>{row.aiMarks ?? "—"}</span>
                  <span>{row.humanMarks ?? "—"}</span>
                  <span
                    className={
                      delta >= 3
                        ? "font-semibold text-[#b64c40]"
                        : "text-[#2f7898]"
                    }
                  >
                    {delta >= 3 ? `${delta} mark deviation` : "aligned"}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="p-10 text-center text-sm text-[#6b8190]">
              No evaluations have been written for this bundle.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
