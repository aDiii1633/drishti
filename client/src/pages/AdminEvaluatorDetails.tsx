import { trpc } from "@/lib/trpc";
import { ArrowLeft, ClipboardCheck, FileStack } from "lucide-react";
import { Link, useRoute } from "wouter";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export default function AdminEvaluatorDetails() {
  const [, params] = useRoute("/admin/evaluators/:id");
  const userId = Number(params?.id);
  const query = trpc.admin.workspace.evaluator.useQuery({ userId }, { enabled: Number.isInteger(userId) && userId > 0 });
  if (query.isLoading) return <p className="text-sm text-[#6b8190]">Loading evaluator details.</p>;
  if (query.isError || !query.data) return <p className="text-sm text-[#9a4b3d]">Evaluator details are unavailable.</p>;
  const { evaluator, assignments } = query.data;
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/evaluators" className="inline-flex items-center gap-2 text-sm text-[#2f6f95]"><ArrowLeft size={15} />Evaluators</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div><p className="mono-label text-[#2f6f95]">{evaluator.subject}</p><h1 className="mt-2 font-display text-4xl">{evaluator.name ?? evaluator.loginId}</h1><p className="mt-2 text-sm text-[#6b8190]">{evaluator.centerName} · {evaluator.email ?? evaluator.loginId}</p></div>
        <div className="flex gap-3 text-sm text-[#587181]"><span className="rounded-xl border border-[#d9eaf3] bg-white px-3 py-2"><FileStack className="mr-1 inline" size={14} />{evaluator.assignmentCount} assigned</span><span className="rounded-xl border border-[#d9eaf3] bg-white px-3 py-2"><ClipboardCheck className="mr-1 inline" size={14} />{evaluator.evaluatedCount} evaluated</span></div>
      </div>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white">
        {assignments.map(sheet => <div key={sheet.id} className="flex flex-wrap items-center gap-4 border-b border-[#e9f2f7] p-5 last:border-b-0"><span className="min-w-[190px] flex-1"><span className="block font-semibold">{sheet.candidateName}</span><span className="mt-1 block text-xs text-[#6b8190]">{sheet.candidateId ?? "Candidate ID pending"}</span></span><span className="text-sm text-[#587181]">{sheet.subject}</span><span className="rounded-full bg-[#eaf6fd] px-2 py-1 text-xs capitalize text-[#2f6f95]">{readable(sheet.processingState)}</span></div>)}
        {!assignments.length && <p className="p-7 text-sm text-[#6b8190]">This evaluator has no assignments in the active session.</p>}
      </div>
    </div>
  );
}
