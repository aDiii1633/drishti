import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

export default function RecheckerRequest() {
  const [, params] = useRoute("/rechecker/request/:id");
  const id = params?.id ?? "";
  const detail = trpc.recheckRequests.get.useQuery(
    { id },
    { enabled: Boolean(id) }
  );
  const [resolutionNote, setResolutionNote] = useState("");
  const submit = trpc.recheckRequests.submit.useMutation({
    onSuccess: () => {
      toast.success("Student re-check decision recorded.");
      detail.refetch();
    },
    onError: error => toast.error(error.message),
  });
  if (detail.isLoading)
    return (
      <div className="grid min-h-64 place-items-center">
        <Loader2 className="animate-spin text-[#2f6f95]" />
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="panel p-8 text-sm text-[#b64c40]">
        {detail.error?.message ?? "This request is unavailable."}
      </div>
    );
  const { request, bundle } = detail.data;
  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/rechecker"
        className="flex w-fit items-center gap-2 text-sm text-[#6b8190]"
      >
        <ArrowLeft size={16} /> Assigned re-checks
      </Link>
      <p className="mono-label mt-8 text-[#2f6f95]">Student re-check request</p>
      <h1 className="mt-2 font-display text-5xl">Review the final record.</h1>
      <p className="mt-3 text-sm text-[#6b8190]">
        {request.studentReference} · Bundle {bundle.id} · {bundle.subject}
      </p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <section className="panel rounded-3xl p-6">
          <div className="flex items-center gap-2 text-[#2f6f95]">
            <ShieldAlert size={17} />
            <span className="mono-label">Student statement</span>
          </div>
          <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-[#2b536a]">
            {request.reason}
          </p>
          <div className="mt-7 rounded-2xl bg-[#eaf6fd] p-4">
            <p className="mono-label text-[#2f6f95]">Current request status</p>
            <p className="mt-2 text-sm font-semibold">{request.status}</p>
          </div>
        </section>
        <section className="panel rounded-3xl p-6">
          <p className="mono-label text-[#2f6f95]">Resolution</p>
          <h2 className="mt-2 font-display text-3xl">Record the decision.</h2>
          <textarea
            value={resolutionNote}
            onChange={event => setResolutionNote(event.target.value)}
            placeholder="Explain the evidence reviewed and the outcome"
            className="mt-6 min-h-36 w-full rounded-xl border border-[#d9eaf3] p-3 text-sm outline-none focus:border-[#75afd0]"
          />
          {request.status === "resolved" || request.status === "rejected" ? (
            <div className="mt-5 flex items-center gap-2 rounded-xl bg-[#e5f4fc] p-4 text-sm text-[#2f7898]">
              <CheckCircle2 size={17} /> {request.resolutionNote}
            </div>
          ) : (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                disabled={submit.isPending || !resolutionNote.trim()}
                onClick={() =>
                  submit.mutate({ id, status: "resolved", resolutionNote })
                }
                className="flex items-center justify-center gap-2 rounded-xl bg-[#163044] py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                <CheckCircle2 size={16} /> Resolve request
              </button>
              <button
                disabled={submit.isPending || !resolutionNote.trim()}
                onClick={() =>
                  submit.mutate({ id, status: "rejected", resolutionNote })
                }
                className="rounded-xl border border-[#d9eaf3] py-3 text-sm font-semibold disabled:opacity-40"
              >
                Reject request
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
