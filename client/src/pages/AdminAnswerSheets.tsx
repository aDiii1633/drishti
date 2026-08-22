import { trpc } from "@/lib/trpc";
import { FileCheck2, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

type View = "all" | "scanned" | "assigned" | "evaluated" | "pending";

const copy: Record<View, { title: string; description: string }> = {
  all: { title: "Total answer sheets", description: "Every answer-sheet record in the active session." },
  scanned: { title: "Scanned answer sheets", description: "Captured answer sheets that have entered the processing workflow." },
  assigned: { title: "Assigned answer sheets", description: "Answer sheets currently assigned to an evaluator desk." },
  evaluated: { title: "Evaluated answer sheets", description: "Submitted, completed, finalized, and re-check records." },
  pending: { title: "Pending evaluation", description: "Scanned answer sheets awaiting an evaluation outcome." },
};

function readable(value: string) {
  return value.replaceAll("_", " ");
}

export default function AdminAnswerSheets({ view }: { view: View }) {
  const [search, setSearch] = useState("");
  const query = trpc.admin.workspace.answerSheets.useQuery({ view, search: search || undefined }, { refetchInterval: 3_000 });
  if (query.isLoading) return <p className="text-sm text-[#6b8190]">Loading answer sheets.</p>;
  if (query.isError) return <p className="text-sm text-[#9a4b3d]">Answer sheets could not be loaded.</p>;
  const labels = copy[view];
  if (!query.data?.currentSession)
    return <section className="panel rounded-2xl p-7 text-sm text-[#6b8190]">Open an exam session to view answer-sheet records.</section>;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mono-label text-[#2f6f95]">{query.data.currentSession.code}</p><h1 className="mt-2 font-display text-4xl">{labels.title}</h1><p className="mt-2 text-sm text-[#6b8190]">{labels.description}</p></div><label className="flex h-10 items-center gap-2 rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm text-[#6b8190]"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search candidate, school, subject" className="w-56 bg-transparent outline-none placeholder:text-[#9cb2be]" /></label></div>
      <div className="mt-7 overflow-hidden rounded-2xl border border-[#d9eaf3] bg-white">
        {query.data.answerSheets.map(sheet => <div key={sheet.id} className="flex flex-wrap items-center gap-4 border-b border-[#e9f2f7] p-5 last:border-b-0"><span className="min-w-[190px] flex-1"><Link href={`/admin/marking?bundle=${encodeURIComponent(sheet.id)}`} className="block font-semibold text-[#163044] hover:text-[#2f6f95]">{sheet.candidateName}</Link><span className="mt-1 block text-xs text-[#6b8190]">{sheet.candidateId ?? "Candidate ID pending"} · {sheet.school}</span></span><span className="text-sm text-[#587181]">{sheet.subject}</span><span className="flex items-center gap-1 text-xs text-[#587181]"><UserRound size={13} />{sheet.evaluator}</span>{sheet.finalScore !== null && sheet.maximumMarks !== null ? <span className="font-mono text-xs font-semibold text-[#163044]">{sheet.finalScore} / {sheet.maximumMarks}</span> : null}{sheet.finalizedAt ? <span className="text-[11px] text-[#6b8190]">Evaluated {new Date(sheet.finalizedAt).toLocaleString()}</span> : null}<span className="rounded-full bg-[#eaf6fd] px-2 py-1 text-xs capitalize text-[#2f6f95]">{readable(sheet.processingState)}</span>{["submitted", "completed", "recheck_required"].includes(sheet.processingState) || sheet.status === "finalized" ? <FileCheck2 size={16} className="text-[#2f7898]" aria-label="Evaluated" /> : null}</div>)}
        {!query.data.answerSheets.length && <p className="p-7 text-sm text-[#6b8190]">No matching answer sheets were found.</p>}
      </div>
    </div>
  );
}
