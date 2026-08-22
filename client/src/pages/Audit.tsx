import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Audit() {
  const session = trpc.session.current.useQuery();
  const role = session.data?.role;
  const list = trpc.deviations.list.useQuery(undefined, {
    enabled: role === "admin",
  });
  const resolve = trpc.deviations.resolve.useMutation({
    onSuccess: () => {
      toast.success("Moderation outcome recorded.");
      list.refetch();
    },
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (role !== "admin")
    return (
      <div className="teacher-readable panel grid min-h-[430px] place-items-center rounded-3xl p-8 text-center">
        <div>
          <ShieldAlert className="mx-auto text-[#b64c40]" />
          <h1 className="mt-5 font-display text-5xl">
            Moderation desk restricted.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#6b8190]">
            Only a center administrator can inspect and resolve score
            deviations.
          </p>
        </div>
      </div>
    );
  return (
    <div className="teacher-readable mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">03 · Moderation ledger</p>
      <h1 className="mt-2 font-display text-5xl">
        Review differences between teacher and AI marks.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        This page shows questions where the teacher and AI marks differ by three
        or more. The original marks stay unchanged while the administrator records the
        final decision.
      </p>
      <div className="mt-8 space-y-4">
        {list.isLoading ? (
          <div className="grid min-h-56 place-items-center">
            <Loader2 className="animate-spin text-[#2f6f95]" />
          </div>
        ) : list.data?.length ? (
          list.data.map(row => (
            <article
              key={row.id}
              className={`panel rounded-3xl p-6 ${row.status === "open" ? "forensic-border" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono-label text-[#2f6f95]">
                    Bundle {row.bundleId}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">
                    {row.delta} mark divergence
                  </h2>
                </div>
                <span
                  className={`rounded-full px-3 py-1 mono-label ${row.status === "open" ? "bg-[#fae2df] text-[#b64c40]" : "bg-[#e5f4fc] text-[#2f7898]"}`}
                >
                  {row.status}
                </span>
              </div>
              {row.status === "open" ? (
                <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
                  <input
                    value={notes[row.id] ?? ""}
                    onChange={event =>
                      setNotes(current => ({
                        ...current,
                        [row.id]: event.target.value,
                      }))
                    }
                    className="h-11 rounded-xl border border-[#d9eaf3] px-3 text-sm outline-none focus:border-[#8fc7e8]"
                    placeholder="Enter moderation rationale"
                  />
                  <button
                    onClick={() =>
                      resolve.mutate({
                        id: row.id,
                        status: "upheld",
                        note:
                          notes[row.id] ||
                          "Human evaluation upheld after moderation.",
                      })
                    }
                    className="press flex items-center justify-center gap-2 rounded-xl bg-[#163044] px-4 text-sm font-semibold text-white"
                  >
                    <CheckCircle2 size={15} />
                    Uphold
                  </button>
                  <button
                    onClick={() =>
                      resolve.mutate({
                        id: row.id,
                        status: "reevaluate",
                        note: notes[row.id] || "Returned for re-evaluation.",
                      })
                    }
                    className="press flex items-center justify-center gap-2 rounded-xl border border-[#d9eaf3] px-4 text-sm font-semibold"
                  >
                    <RefreshCw size={15} />
                    Re-evaluate
                  </button>
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-[#eef7fc] p-4 text-sm leading-6 text-[#587181]">
                  <Gavel size={15} className="mr-2 inline text-[#2f6f95]" />
                  {row.resolutionNote ?? "Outcome recorded without a note."}
                </p>
              )}
            </article>
          ))
        ) : (
          <div className="panel grid min-h-64 place-items-center rounded-3xl p-8 text-center">
            <div>
              <CheckCircle2 className="mx-auto text-[#2f7898]" />
              <p className="mt-4 text-sm font-medium">
                No deviations require review.
              </p>
              <p className="mt-2 text-xs text-[#6b8190]">
                The ledger will populate when a human and AI score differ by
                three or more marks.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
