import { trpc } from "@/lib/trpc";
import { ArrowRight, CheckCircle2, Gavel, Loader2 } from "lucide-react";
import { Link } from "wouter";

export default function RecheckerDashboard() {
  const cases = trpc.deviations.list.useQuery(undefined, { refetchInterval: 5_000 });
  const requests = trpc.recheckRequests.list.useQuery(undefined, { refetchInterval: 5_000 });
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Re-checker workspace</p>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="mt-2 font-display text-5xl">Assigned Re-checks</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
            Only deviation cases assigned to this re-checker account are
            visible.
          </p>
        </div>
        <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 mono-label text-[#2f6f95]">
          {cases.data?.length ?? 0} cases
        </span>
      </div>
      <section className="panel mt-8 overflow-hidden rounded-3xl">
        {cases.isLoading ? (
          <div className="grid min-h-56 place-items-center">
            <Loader2 className="animate-spin text-[#2f6f95]" />
          </div>
        ) : cases.data?.length ? (
          <div className="divide-y divide-[#e3f0f6]">
            {cases.data.map(item => (
              <article
                key={item.id}
                className="flex flex-wrap items-center gap-4 px-6 py-5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
                  <Gavel size={17} />
                </span>
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-semibold">
                    Bundle {item.bundleId}
                  </p>
                  <p className="mt-1 mono-label text-[#7f9aaa]">
                    {item.delta} mark divergence · {item.status}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 mono-label ${item.status === "open" ? "bg-[#fff1ef] text-[#b64c40]" : "bg-[#e5f4fc] text-[#2f7898]"}`}
                >
                  {item.status}
                </span>
                <Link
                  href={`/rechecker/case/${item.id}`}
                  className="press flex items-center gap-2 rounded-xl bg-[#2f6f95] px-3.5 py-2.5 text-xs font-semibold text-white"
                >
                  {item.status === "open" ? "START RE-CHECK" : "VIEW"}
                  <ArrowRight size={14} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="grid min-h-64 place-items-center p-8 text-center">
            <div>
              <CheckCircle2 className="mx-auto text-[#2f7898]" />
              <p className="mt-4 text-sm font-medium">
                No re-checks are assigned.
              </p>
              <p className="mt-2 text-xs leading-5 text-[#6b8190]">
                Assigned deviation cases will appear here.
              </p>
            </div>
          </div>
        )}
      </section>
      <section className="panel mt-6 overflow-hidden rounded-3xl">
        <div className="border-b border-[#d9eaf3] px-6 py-4">
          <p className="mono-label text-[#2f6f95]">Student requests</p>
          <p className="mt-1 text-sm text-[#6b8190]">
            Requests routed to this re-checker desk.
          </p>
        </div>
        {requests.data?.length ? (
          requests.data.map(item => (
            <article
              key={item.id}
              className="flex flex-wrap items-center gap-4 border-b border-[#e3f0f6] px-6 py-5 last:border-b-0"
            >
              <div className="min-w-[220px] flex-1">
                <p className="text-sm font-semibold">{item.studentReference}</p>
                <p className="mt-1 mono-label text-[#7f9aaa]">
                  Bundle {item.bundleId} · {item.status}
                </p>
              </div>
              <Link
                href={`/rechecker/request/${item.id}`}
                className="press flex items-center gap-2 rounded-xl bg-[#2f6f95] px-3.5 py-2.5 text-xs font-semibold text-white"
              >
                REVIEW <ArrowRight size={14} />
              </Link>
            </article>
          ))
        ) : (
          <p className="p-6 text-sm text-[#6b8190]">
            No student re-check requests are assigned.
          </p>
        )}
      </section>
    </div>
  );
}
