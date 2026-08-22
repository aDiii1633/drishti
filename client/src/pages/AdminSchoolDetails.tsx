import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileStack, Users } from "lucide-react";
import { Link, useRoute } from "wouter";

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export default function AdminSchoolDetails() {
  const [, params] = useRoute("/admin/schools/:id");
  const query = trpc.admin.workspace.school.useQuery({ id: params?.id ?? "" }, { enabled: Boolean(params?.id) });
  if (query.isLoading) return <p className="text-sm text-[#6b8190]">Loading school details.</p>;
  if (query.isError || !query.data) return <p className="text-sm text-[#9a4b3d]">School details are unavailable.</p>;
  const { school, answerSheets } = query.data;
  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/schools" className="inline-flex items-center gap-2 text-sm text-[#2f6f95]"><ArrowLeft size={15} />Schools</Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div><p className="mono-label text-[#2f6f95]">{school.code}</p><h1 className="mt-2 font-display text-4xl">{school.name}</h1><p className="mt-2 text-sm text-[#6b8190]">{school.location ?? "Location pending"} · {query.data.currentSession.name}</p></div>
        <div className="flex gap-3 text-sm text-[#587181]"><span className="rounded-xl border border-[#d9eaf3] bg-white px-3 py-2"><Users className="mr-1 inline" size={14} />{query.data.studentCount} candidates</span><span className="rounded-xl border border-[#d9eaf3] bg-white px-3 py-2"><FileStack className="mr-1 inline" size={14} />{answerSheets.length} sheets</span></div>
      </div>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white">
        {answerSheets.map(sheet => <div key={sheet.id} className="flex flex-wrap items-center gap-4 border-b border-[#e9f2f7] p-5 last:border-b-0"><span className="min-w-[180px] flex-1"><span className="block font-semibold">{sheet.candidateName}</span><span className="mt-1 block text-xs text-[#6b8190]">{sheet.candidateId ?? "Candidate ID pending"}</span></span><span className="text-sm text-[#587181]">{sheet.subject}</span><span className="rounded-full bg-[#eaf6fd] px-2 py-1 text-xs capitalize text-[#2f6f95]">{readable(sheet.processingState)}</span></div>)}
        {!answerSheets.length && <p className="p-7 text-sm text-[#6b8190]">No answer sheets have been received from this school.</p>}
      </div>
    </div>
  );
}
