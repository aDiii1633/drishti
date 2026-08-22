import { trpc } from "@/lib/trpc";
import { Building2, ChevronRight, FileStack, Users } from "lucide-react";
import { Link } from "wouter";

export default function AdminSchools() {
  const query = trpc.admin.workspace.schools.useQuery(undefined, { refetchInterval: 5_000 });
  if (query.isLoading) return <p className="text-sm text-[#6b8190]">Loading schools.</p>;
  if (query.isError) return <p className="text-sm text-[#9a4b3d]">Schools could not be loaded.</p>;
  if (!query.data?.currentSession)
    return <section className="panel rounded-2xl p-7 text-sm text-[#6b8190]">Open an exam session to view participating schools.</section>;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">{query.data.currentSession.code}</p>
      <h1 className="mt-2 font-display text-4xl">Schools</h1>
      <p className="mt-2 text-sm text-[#6b8190]">Participating schools and their current answer-sheet progress.</p>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white">
        {query.data.schools.length ? query.data.schools.map(school => (
          <Link key={school.id} href={`/admin/schools/${school.id}`} className="flex flex-wrap items-center gap-4 border-b border-[#e9f2f7] p-5 last:border-b-0 hover:bg-[#f8fcff]">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]"><Building2 size={18} /></span>
            <span className="min-w-[180px] flex-1"><span className="block font-semibold">{school.name}</span><span className="mt-1 block text-xs text-[#6b8190]">{school.code} · {school.location ?? "Location pending"}</span></span>
            <span className="text-xs text-[#6b8190]"><Users className="mr-1 inline" size={13} />{school.studentCount} candidates</span>
            <span className="text-xs text-[#6b8190]"><FileStack className="mr-1 inline" size={13} />{school.answerSheetCount} sheets</span>
            <span className="text-xs font-medium text-[#2f6f95]">{school.evaluatedCount}/{school.scannedCount} evaluated</span>
            <ChevronRight size={17} className="text-[#7893a2]" />
          </Link>
        )) : <p className="p-7 text-sm text-[#6b8190]">No schools are linked to this session yet.</p>}
      </div>
    </div>
  );
}
