import { trpc } from "@/lib/trpc";
import { AlertCircle, FileCheck2, Loader2, ShieldCheck } from "lucide-react";

function readable(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

export default function StudentPortal() {
  const workspace = trpc.student.workspace.useQuery(undefined, {
    refetchInterval: 5_000,
  });

  if (workspace.isLoading)
    return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-[#2f6f95]" /></div>;
  if (workspace.isError || !workspace.data)
    return <div className="panel rounded-2xl p-6 text-sm text-[#b64c40]">Your student record is temporarily unavailable. Refresh to try again.</div>;

  const { student, bundles, recheckRequests } = workspace.data;
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mono-label text-[#2f6f95]">Student portal</p>
      <h1 className="mt-2 font-display text-5xl">Your examination record.</h1>
      <p className="mt-3 text-sm text-[#6b8190]">{student.name} · {student.candidateId}</p>
      {bundles.length ? (
        <div className="mt-8 space-y-4">
          {bundles.map(bundle => {
            const request = recheckRequests.find(item => item.bundleId === bundle.id);
            return <section key={bundle.id} className="panel rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-[#2f6f95]"><FileCheck2 size={17} /><span className="mono-label">Answer sheet</span></div>
                  <h2 className="mt-3 text-lg font-semibold">{bundle.subject}</h2>
                  <p className="mt-1 text-sm text-[#6b8190]">{readable(bundle.processingState)} · {bundle.pageCount} page{bundle.pageCount === 1 ? "" : "s"}</p>
                </div>
                <span className="rounded-full bg-[#eaf6fd] px-3 py-1.5 text-xs font-medium text-[#2f6f95]">{readable(bundle.status)}</span>
              </div>
              {request ? <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#f8fcff] p-3 text-sm text-[#587181]"><ShieldCheck size={16} className="text-[#2f7898]" /> Re-check request: {readable(request.status)}</div> : <p className="mt-4 text-sm text-[#6b8190]">A re-check request becomes available after this result is finalized and its result QR is issued.</p>}
            </section>;
          })}
        </div>
      ) : (
        <section className="panel mt-8 rounded-2xl p-8 text-center"><AlertCircle className="mx-auto text-[#2f6f95]" /><h2 className="mt-4 text-lg font-semibold">No scanned paper yet.</h2><p className="mt-2 text-sm text-[#6b8190]">A scanner must capture an answer sheet against its verified bundle QR before it appears here.</p></section>
      )}
    </div>
  );
}
