import { Building2, FileCheck2, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SchoolAdminDashboard() {
  const bundles = trpc.bundles.list.useQuery(undefined, { refetchInterval: 10_000 });
  if (bundles.isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-[#2f6f95]" /></div>;
  if (bundles.isError) return <div className="panel rounded-2xl p-6 text-sm text-[#b64c40]">School intake is temporarily unavailable. Refresh to try again.</div>;
  const scanned = bundles.data?.filter(bundle => bundle.processingState !== "saved").length ?? 0;
  return <div className="mx-auto max-w-5xl">
    <p className="mono-label text-[#2f6f95]">School administration</p>
    <h1 className="mt-2 font-display text-5xl">Your school examination intake.</h1>
    <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">Only answer sheets associated with your school administration scope are visible here.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      <section className="panel rounded-2xl p-5"><Building2 className="text-[#2f6f95]" size={20} /><p className="mt-5 mono-label text-[#6b8190]">Answer sheets</p><p className="mt-2 font-display text-4xl">{bundles.data?.length ?? 0}</p></section>
      <section className="panel rounded-2xl p-5"><FileCheck2 className="text-[#2f6f95]" size={20} /><p className="mt-5 mono-label text-[#6b8190]">Processed intake</p><p className="mt-2 font-display text-4xl">{scanned}</p></section>
    </div>
    <section className="panel mt-6 overflow-hidden rounded-2xl"><div className="border-b border-[#d9eaf3] px-5 py-4 text-sm font-semibold">Recent answer sheets</div>{bundles.data?.length ? <div className="divide-y divide-[#e3f0f6]">{bundles.data.slice(0, 12).map(bundle => <div key={bundle.id} className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-[180px] flex-1"><p className="text-sm font-semibold">{bundle.candidateName}</p><p className="mt-1 text-xs text-[#6b8190]">{bundle.subject}</p></div><span className="rounded-full bg-[#eaf6fd] px-2.5 py-1 text-xs font-medium text-[#2f6f95]">{bundle.processingState.replaceAll("_", " ")}</span></div>)}</div> : <p className="p-6 text-sm text-[#6b8190]">No answer sheets are available for this school yet.</p>}</section>
  </div>;
}
