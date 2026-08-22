import { trpc } from "@/lib/trpc";
import { Database, LockKeyhole, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function AdminConsole() {
  const session = trpc.session.current.useQuery();
  const role = session.data?.role;
  const consoleData = trpc.admin.console.useQuery(undefined, {
    enabled: role === "admin",
    refetchInterval: 5000,
  });
  const staff = trpc.admin.staff.list.useQuery(undefined, { enabled: role === "admin", refetchInterval: 5000 });
  const [staffForm, setStaffForm] = useState({ name: "", email: "", role: "operator" as "operator" | "evaluator" | "school_admin", centerName: "", schoolId: "", subject: "", temporaryPassword: "" });
  const createStaff = trpc.admin.staff.create.useMutation({
    onSuccess: () => { toast.success("Staff account created. Share the temporary password securely."); setStaffForm({ name: "", email: "", role: "operator", centerName: "", schoolId: "", subject: "", temporaryPassword: "" }); staff.refetch(); },
    onError: error => toast.error(error.message),
  });
  const setStaffActive = trpc.admin.staff.setActive.useMutation({ onSuccess: () => staff.refetch(), onError: error => toast.error(error.message) });
  const [evaluatorSelection, setEvaluatorSelection] = useState<
    Record<string, string>
  >({});
  const assignEvaluator = trpc.admin.assignEvaluator.useMutation({
    onSuccess: () => {
      toast.success("Paper assigned to evaluator.");
      consoleData.refetch();
    },
    onError: error => toast.error(error.message),
  });
  if (role !== "admin")
    return (
      <div className="panel grid min-h-[430px] place-items-center rounded-3xl p-8 text-center">
        <div>
          <LockKeyhole className="mx-auto text-[#b64c40]" />
          <h1 className="mt-5 font-display text-5xl">Data console denied.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-[#6b8190]">
            This route and its server procedure are restricted exclusively to
            the administrator role.
          </p>
        </div>
      </div>
    );
  return (
    <div className="mx-auto max-w-6xl">
      <p className="mono-label text-[#b64c40]">Administrator restricted</p>
      <h1 className="mt-2 font-display text-5xl">Data console.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        This viewer exposes metadata—not raw file bytes—for operational
        verification. It is not visible or queryable from any other role.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Bundles", consoleData.data?.bundles.length],
          ["Evaluations", consoleData.data?.evaluations.length],
          ["Audit events", consoleData.data?.auditEvents.length],
        ].map(([label, count]) => (
          <div key={String(label)} className="panel rounded-2xl p-5">
            <Database size={17} className="text-[#2f6f95]" />
            <p className="mt-5 font-display text-4xl">{count ?? "—"}</p>
            <p className="mt-2 mono-label text-[#6b8190]">{String(label)}</p>
          </div>
        ))}
      </div>
      <section className="panel mt-6 rounded-3xl p-5">
        <div className="flex items-center gap-2"><UserPlus size={16} className="text-[#2f6f95]" /><p className="text-sm font-semibold">Staff accounts</p></div>
        <form onSubmit={event => { event.preventDefault(); createStaff.mutate({ ...staffForm, schoolId: staffForm.role === "school_admin" ? staffForm.schoolId : undefined, subject: staffForm.role === "evaluator" ? staffForm.subject : undefined }); }} className="mt-4 grid gap-3 md:grid-cols-3">
          <input required value={staffForm.name} onChange={e => setStaffForm({ ...staffForm, name: e.target.value })} placeholder="Full name" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" />
          <input required type="email" value={staffForm.email} onChange={e => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="Official email" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" />
          <select value={staffForm.role} onChange={e => setStaffForm({ ...staffForm, role: e.target.value as typeof staffForm.role })} className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm"><option value="operator">Scanner</option><option value="evaluator">Evaluator</option><option value="school_admin">School Admin</option></select>
          <input required value={staffForm.centerName} onChange={e => setStaffForm({ ...staffForm, centerName: e.target.value })} placeholder="Center" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" />
          {staffForm.role === "evaluator" ? <input required value={staffForm.subject} onChange={e => setStaffForm({ ...staffForm, subject: e.target.value })} placeholder="Subject" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" /> : staffForm.role === "school_admin" ? <input required value={staffForm.schoolId} onChange={e => setStaffForm({ ...staffForm, schoolId: e.target.value })} placeholder="School ID" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" /> : <div />}
          <input required minLength={8} type="password" value={staffForm.temporaryPassword} onChange={e => setStaffForm({ ...staffForm, temporaryPassword: e.target.value })} placeholder="Temporary password (8+)" className="h-10 rounded-xl border border-[#d9eaf3] px-3 text-sm" />
          <button disabled={createStaff.isPending} className="h-10 rounded-xl bg-[#163044] text-sm font-semibold text-white disabled:opacity-50">Create staff account</button>
        </form>
        <div className="mt-5 divide-y divide-[#e3f0f6] border-t border-[#d9eaf3]">
          {staff.data?.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 py-3 text-sm"><span className="min-w-[180px] flex-1 font-semibold">{item.name} <span className="font-normal text-[#6b8190]">{item.email}</span></span><span className="mono-label text-[#6b8190]">{item.role} · {item.centerName}{item.schoolId ? ` · ${item.schoolId}` : ""}</span><button onClick={() => setStaffActive.mutate({ userId: item.id, isActive: !item.isActive })} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${item.isActive ? "bg-[#eaf6fd] text-[#2f6f95]" : "bg-[#fff0ee] text-[#b64c40]"}`}>{item.isActive ? "Active" : "Disabled"}</button></div>)}
        </div>
      </section>
      <section className="panel mt-6 overflow-hidden rounded-3xl">
        <div className="flex items-center gap-2 border-b border-[#d9eaf3] px-5 py-4">
          <ShieldAlert size={16} className="text-[#2f6f95]" />
          <p className="text-sm font-semibold">Recent audit events</p>
        </div>
        <div className="divide-y divide-[#e3f0f6]">
          {consoleData.data?.auditEvents.slice(0, 12).map(event => (
            <div
              key={event.id}
              className="flex flex-wrap items-center gap-4 px-5 py-4"
            >
              <span className="rounded-full bg-[#eaf6fd] px-2 py-1 mono-label text-[#2f6f95]">
                {event.actorRole}
              </span>
              <p className="flex-1 text-sm">{event.detail}</p>
              <span className="text-xs text-[#6b8190]">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          )) ?? (
            <div className="p-8 text-sm text-[#6b8190]">
              No audit data has been recorded.
            </div>
          )}
        </div>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-hidden rounded-3xl">
          <div className="border-b border-[#d9eaf3] px-5 py-4">
            <p className="text-sm font-semibold">Evaluator assignment</p>
            <p className="mt-1 text-xs text-[#6b8190]">
              Route captured papers to an evaluator desk.
            </p>
          </div>
          <div className="divide-y divide-[#e3f0f6]">
            {consoleData.data?.bundles
              .filter(
                bundle =>
                  bundle.processingState === "ready_for_evaluation" ||
                  bundle.processingState === "assigned"
              )
              .map(bundle => (
                <div
                  key={bundle.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-[150px] flex-1">
                    <p className="text-sm font-semibold">
                      {bundle.candidateName}
                    </p>
                    <p className="mono-label text-[#7f9aaa]">
                      {bundle.subject} · {bundle.processingState}
                    </p>
                  </div>
                  <select
                    aria-label={`Evaluator for ${bundle.id}`}
                    value={evaluatorSelection[bundle.id] ?? ""}
                    onChange={event =>
                      setEvaluatorSelection({
                        ...evaluatorSelection,
                        [bundle.id]: event.target.value,
                      })
                    }
                    className="h-9 rounded-lg border border-[#d9eaf3] px-2 text-xs"
                  >
                    <option value="">Choose evaluator</option>
                    {consoleData.data?.users
                      .filter(user => user.role === "evaluator")
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name ?? user.loginId}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={
                      !evaluatorSelection[bundle.id] ||
                      assignEvaluator.isPending
                    }
                    onClick={() =>
                      assignEvaluator.mutate({
                        bundleId: bundle.id,
                        evaluatorUserId: Number(evaluatorSelection[bundle.id]),
                      })
                    }
                    className="rounded-lg bg-[#2f6f95] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    Assign
                  </button>
                </div>
              ))}
            {!consoleData.data?.bundles.some(
              bundle =>
                bundle.processingState === "ready_for_evaluation" ||
                bundle.processingState === "assigned"
            ) && (
              <p className="p-5 text-sm text-[#6b8190]">
                No papers are waiting for evaluator assignment.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
