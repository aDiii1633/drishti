import { BadgeCheck, Mail, UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function EvaluatorProfile() {
  const profile = trpc.evaluator.profile.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  if (profile.isLoading)
    return <p className="text-sm text-[#6b8190]">Loading profile.</p>;
  if (profile.isError || !profile.data)
    return (
      <p className="text-sm text-[#6b8190]">
        Profile information could not be loaded. Refresh to try again.
      </p>
    );

  const fields = [
    ["Name", profile.data.name || "Not recorded"],
    ["Evaluator ID", profile.data.loginId || `User ${profile.data.id}`],
    ["Email", profile.data.email || "Not recorded"],
    ["Role", "Evaluator"],
    ["Subject", profile.data.subject || "Not recorded"],
    ["Centre", profile.data.centerName || "Not recorded"],
    ["Account status", "Active authenticated account"],
    ["Assigned papers", String(profile.data.assignedPaperCount)],
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mono-label text-[#2f6f95]">Evaluator</p>
      <h1 className="mt-2 font-display text-5xl">Your profile.</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
        Account information available to your evaluator workspace.
      </p>
      <section className="panel mt-8 rounded-3xl p-6">
        <div className="flex items-center gap-3 border-b border-[#d9eaf3] pb-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
            <UserRound size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold">{profile.data.name || "Evaluator"}</p>
            <p className="mono-label mt-1 text-[#7f9aaa]">Authenticated evaluator account</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[#d9eaf3] bg-white p-4">
              <p className="mono-label text-[#7f9aaa]">{label}</p>
              <p className="mt-2 break-words text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {profile.data.email && (
          <p className="mt-5 flex items-center gap-2 text-xs text-[#6b8190]">
            <Mail size={14} /> Email comes from the authenticated account record.
          </p>
        )}
        <p className="mt-3 flex items-center gap-2 text-xs text-[#6b8190]">
          <BadgeCheck size={14} /> Role and permission fields are read-only here.
        </p>
      </section>
    </div>
  );
}
