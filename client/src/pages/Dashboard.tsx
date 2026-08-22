import { trpc } from "@/lib/trpc";
import {
  Building2,
  ClipboardCheck,
  FileCheck2,
  FileStack,
  ScanLine,
  Users,
} from "lucide-react";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
}: {
  label: string;
  value: number | undefined;
  hint: string;
  icon: typeof Building2;
  accent?: boolean;
}) {
  return (
    <div className={`panel rounded-2xl p-5 ${accent ? "forensic-border" : ""}`}>
      <Icon size={17} className="text-[#2f6f95]" />
      <p className="mono-label text-[#7f9aaa]">{label}</p>
      <p className="mt-4 font-display text-5xl">{value ?? "—"}</p>
      <p className="mt-2 text-xs text-[#6b8190]">{hint}</p>
    </div>
  );
}

export default function Dashboard() {
  const overview = trpc.dashboard.adminOverview.useQuery(undefined, {
    refetchInterval: 5_000,
  });
  const metrics = overview.data?.metrics;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mono-label text-[#2f6f95]">Center administration</p>
          <h1 className="mt-2 font-display text-5xl">
            Operational examination overview.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
            Live counts for the current open exam session.
          </p>
        </div>
        <span className="mono-label text-[#6b8190]">
          {overview.data?.updatedAt
            ? `Updated ${new Date(overview.data.updatedAt).toLocaleTimeString()}`
            : "Waiting for an open exam session"}
        </span>
      </div>
      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Schools"
          value={metrics?.schools}
          hint="registered center in this session"
          icon={Building2}
        />
        <Stat
          label="Evaluators"
          value={metrics?.evaluators}
          hint="registered evaluator accounts"
          icon={Users}
        />
        <Stat
          label="Total answer sheets"
          value={metrics?.totalAnswerSheets}
          hint="registered booklet records"
          icon={FileStack}
        />
        <Stat
          label="Scanned"
          value={metrics?.scanned}
          hint="saved scan records and later stages"
          icon={ScanLine}
        />
        <Stat
          label="Assigned"
          value={metrics?.assigned}
          hint="answer sheets on evaluator desks"
          icon={ClipboardCheck}
        />
        <Stat
          label="Evaluated"
          value={metrics?.evaluated}
          hint="submitted, re-check, completed, or finalized"
          icon={FileCheck2}
        />
        <Stat
          label="Pending evaluation"
          value={metrics?.pendingEvaluation}
          hint="scanned records not yet evaluated"
          icon={ClipboardCheck}
          accent
        />
      </section>
      {overview.isLoading ? (
        <p className="mt-7 text-sm text-[#6b8190]">Loading live session metrics.</p>
      ) : overview.isError ? (
        <section className="panel mt-7 rounded-3xl p-7 text-sm leading-6 text-[#9a4b3d]">
          Live session metrics could not be loaded. Refresh the workspace or verify the database connection.
        </section>
      ) : !overview.data?.currentSession ? (
        <section className="panel mt-7 rounded-3xl p-7 text-sm leading-6 text-[#6b8190]">
          Open an exam session to view its live operational metrics.
        </section>
      ) : (
        <section className="panel mt-7 rounded-3xl p-6">
          <p className="mono-label text-[#2f6f95]">Current session</p>
          <p className="mt-2 text-lg font-semibold">
            {overview.data.currentSession.name}
          </p>
          <p className="mt-1 text-sm text-[#6b8190]">
            {overview.data.currentSession.code} · {overview.data.currentSession.centerName}
          </p>
        </section>
      )}
    </div>
  );
}
