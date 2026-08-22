import { trpc } from "@/lib/trpc";
import { ChevronRight, ClipboardCheck, UserRound } from "lucide-react";
import { Link } from "wouter";

export default function AdminEvaluators() {
  const query = trpc.admin.workspace.evaluators.useQuery(undefined, { refetchInterval: 5_000 });
  if (query.isLoading) return <p className="text-sm text-[#6b8190]">Loading evaluators.</p>;
  if (query.isError) return <p className="text-sm text-[#9a4b3d]">Evaluators could not be loaded.</p>;
  if (!query.data?.currentSession)
    return <section className="panel rounded-2xl p-7 text-sm text-[#6b8190]">Open an exam session to view evaluator workloads.</section>;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">{query.data.currentSession.code}</p>
      <h1 className="mt-2 font-display text-4xl">Evaluators</h1>
      <p className="mt-2 text-sm text-[#6b8190]">Workload and evaluation progress for the active session.</p>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white">
        {query.data.evaluators.length ? query.data.evaluators.map(evaluator => (
          <Link key={evaluator.id} href={`/admin/evaluators/${evaluator.id}`} className="flex flex-wrap items-center gap-4 border-b border-[#e9f2f7] p-5 last:border-b-0 hover:bg-[#f8fcff]">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]"><UserRound size={18} /></span>
            <span className="min-w-[190px] flex-1"><span className="block font-semibold">{evaluator.name ?? evaluator.loginId}</span><span className="mt-1 block text-xs text-[#6b8190]">{evaluator.subject} · {evaluator.centerName}</span></span>
            <span className="text-sm text-[#587181]">{evaluator.assignmentCount} assigned</span>
            <span className="text-sm font-medium text-[#2f6f95]"><ClipboardCheck className="mr-1 inline" size={14} />{evaluator.evaluatedCount} evaluated</span>
            <span className="text-sm text-[#9a6539]">{evaluator.pendingCount} pending</span>
            <ChevronRight size={17} className="text-[#7893a2]" />
          </Link>
        )) : <p className="p-7 text-sm text-[#6b8190]">No evaluator accounts are available.</p>}
      </div>
    </div>
  );
}
