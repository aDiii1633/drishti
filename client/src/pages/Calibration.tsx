import { trpc } from "@/lib/trpc";
import { Beaker, CheckCircle2, Plus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Calibration() {
  const session = trpc.session.current.useQuery();
  const permitted = Boolean(
    session.data &&
      ["operator", "admin"].includes(session.data.role)
  );
  const samples = trpc.calibration.list.useQuery(undefined, {
    enabled: permitted,
  });
  const utils = trpc.useUtils();
  const record = trpc.calibration.record.useMutation({
    onSuccess: async () => {
      await utils.calibration.list.invalidate();
      toast.success("Labelled scan outcome recorded.");
      setSourceLabel("");
      setVariance(0);
      setNote("");
    },
    onError: error => toast.error(error.message),
  });
  const [sourceLabel, setSourceLabel] = useState("");
  const [expectedClarity, setExpectedClarity] = useState<"CLEAR" | "BLURRY">(
    "CLEAR"
  );
  const [observedClarity, setObservedClarity] = useState<"CLEAR" | "BLURRY">(
    "CLEAR"
  );
  const [variance, setVariance] = useState(0);
  const [note, setNote] = useState("");
  if (!permitted)
    return (
      <div className="mx-auto max-w-3xl panel rounded-3xl p-8">
        <ShieldAlert className="text-[#b64c40]" />
        <h1 className="mt-4 font-display text-4xl">
          Calibration is a controlled review.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#6b8190]">
          Only the intake, moderation, and administration desks can record
          labelled clarity samples. This keeps threshold changes accountable.
        </p>
      </div>
    );
  const total = samples.data?.total ?? 0;
  const accuracy = samples.data?.accuracy;
  const remaining = samples.data?.remainingToFifty ?? 50;
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#2f6f95]">Clarity calibration</p>
      <h1 className="mt-2 font-display text-5xl">
        Validate the gate. Do not guess.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        Drishti’s clarity check is deterministic variance-of-Laplacian analysis,
        not an AI vision model trained on uploads. Label representative scans,
        compare the observed verdict with human review, and only then consider a
        threshold adjustment.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric
          label="Labelled scans"
          value={total}
          detail={`${remaining} remaining to a 50-scan review set`}
        />
        <Metric
          label="Human agreement"
          value={accuracy === null ? "—" : `${accuracy}%`}
          detail="observed verdict vs human label"
        />
        <Metric
          label="Current gate"
          value="variance"
          detail="page-level Laplacian measurement"
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <Beaker size={17} className="text-[#2f6f95]" />
            <p className="mono-label text-[#2f6f95]">Record a sample</p>
          </div>
          <label className="mt-5 block">
            <span className="mono-label text-[#6b8190]">Sample label</span>
            <input
              value={sourceLabel}
              onChange={event => setSourceLabel(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
              placeholder="e.g. Physics scan, low-light page 3"
            />
          </label>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Select
              label="Human label"
              value={expectedClarity}
              setValue={setExpectedClarity}
            />
            <Select
              label="Drishti result"
              value={observedClarity}
              setValue={setObservedClarity}
            />
          </div>
          <label className="mt-4 block">
            <span className="mono-label text-[#6b8190]">Measured variance</span>
            <input
              type="number"
              min="0"
              value={variance}
              onChange={event => setVariance(Number(event.target.value))}
              className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
            />
          </label>
          <label className="mt-4 block">
            <span className="mono-label text-[#6b8190]">Review note</span>
            <textarea
              value={note}
              onChange={event => setNote(event.target.value)}
              className="mt-2 min-h-20 w-full rounded-xl border border-[#d9eaf3] p-3 text-sm"
              placeholder="What made this scan clearly readable or unreadable?"
            />
          </label>
          <button
            onClick={() =>
              record.mutate({
                sourceLabel,
                expectedClarity,
                observedClarity,
                laplacianVariance: variance,
                reviewerNote: note || undefined,
              })
            }
            disabled={!sourceLabel.trim() || record.isPending}
            className="press mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#163044] py-3 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Plus size={16} />
            Add labelled outcome
          </button>
        </section>
        <section className="panel rounded-3xl p-6">
          <p className="mono-label text-[#2f6f95]">Review ledger</p>
          <h2 className="mt-2 font-display text-3xl">
            Evidence before tuning.
          </h2>
          <p className="mt-2 text-xs leading-5 text-[#6b8190]">
            Aim for at least 50 varied samples—clear handwriting, light
            handwriting, low contrast, shadows, skew, faint pencil, and genuine
            blur—then review mismatches with an administrator.
          </p>
          <div className="mt-5 max-h-[450px] overflow-y-auto rounded-2xl border border-[#d9eaf3]">
            {samples.isLoading ? (
              <p className="p-4 text-sm text-[#6b8190]">
                Loading the calibration ledger…
              </p>
            ) : samples.data?.rows.length ? (
              samples.data.rows.map(row => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 border-b border-[#d9eaf3] p-4 last:border-0"
                >
                  <CheckCircle2
                    size={16}
                    className={
                      row.expectedClarity === row.observedClarity
                        ? "text-[#2f7898]"
                        : "text-[#b64c40]"
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {row.sourceLabel}
                    </p>
                    <p className="mt-1 text-xs text-[#6b8190]">
                      Human: {row.expectedClarity} · Drishti:{" "}
                      {row.observedClarity} · variance {row.laplacianVariance}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 mono-label ${row.expectedClarity === row.observedClarity ? "bg-[#e5f4fc] text-[#2f7898]" : "bg-[#fae2df] text-[#b64c40]"}`}
                  >
                    {row.expectedClarity === row.observedClarity
                      ? "match"
                      : "review"}
                  </span>
                </div>
              ))
            ) : (
              <p className="p-5 text-sm leading-6 text-[#6b8190]">
                No labelled calibration outcomes yet. Add real representative
                scans; do not use simulated samples to justify a production
                threshold.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="panel rounded-2xl p-5">
      <p className="mono-label text-[#2f6f95]">{label}</p>
      <p className="mt-3 font-display text-4xl">{value}</p>
      <p className="mt-2 text-xs text-[#6b8190]">{detail}</p>
    </div>
  );
}
function Select({
  label,
  value,
  setValue,
}: {
  label: string;
  value: "CLEAR" | "BLURRY";
  setValue: (value: "CLEAR" | "BLURRY") => void;
}) {
  return (
    <label>
      <span className="mono-label text-[#6b8190]">{label}</span>
      <select
        value={value}
        onChange={event => setValue(event.target.value as "CLEAR" | "BLURRY")}
        className="mt-2 h-11 w-full rounded-xl border border-[#d9eaf3] bg-white px-3 text-sm"
      >
        <option value="CLEAR">CLEAR</option>
        <option value="BLURRY">BLURRY</option>
      </select>
    </label>
  );
}
