import { CheckCircle2, Loader2, ShieldX } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { toast } from "sonner";

type Verification = {
  verified: boolean;
  bundleId?: string;
  subject?: string;
  status?: string;
  finalizedAt?: string;
  message?: string;
};
export default function QrVerify() {
  const [, params] = useRoute("/verify/:token");
  const [result, setResult] = useState<Verification | null>(null);
  const [studentName, setStudentName] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [reason, setReason] = useState("");
  const [requested, setRequested] = useState(false);
  const request = trpc.recheckRequests.create.useMutation({
    onSuccess: () => {
      setRequested(true);
      toast.success("Re-check request submitted.");
    },
    onError: error => toast.error(error.message),
  });
  useEffect(() => {
    if (!params?.token) return;
    fetch(`/api/v1/qr/verify/${params.token}`)
      .then(response => response.json())
      .then(setResult)
      .catch(() =>
        setResult({
          verified: false,
          message: "Verification service is unavailable.",
        })
      );
  }, [params?.token]);
  const good = result?.verified;
  return (
    <main className="grain dot-grid grid min-h-screen place-items-center bg-[#f8fcff] p-6">
      <div className="panel w-full max-w-xl rounded-[2rem] p-8 text-center sm:p-12">
        {!result ? (
          <Loader2 className="mx-auto animate-spin text-[#2f6f95]" />
        ) : good ? (
          <>
            <CheckCircle2 className="mx-auto text-[#2f7898]" size={42} />
            <p className="mono-label mt-6 text-[#2f7898]">
              Drishti verification complete
            </p>
            <h1 className="mt-3 font-display text-5xl">Record verified.</h1>
            <p className="mt-5 text-sm leading-6 text-[#6b8190]">
              This finalized examination artifact belongs to the protected
              Drishti record for{" "}
              <strong className="text-[#163044]">{result.subject}</strong>.
            </p>
            <div className="mt-7 rounded-2xl bg-[#eaf6fd] p-4">
              <p className="mono-label text-[#2f6f95]">Bundle reference</p>
              <p className="mt-2 break-all text-sm font-medium">
                {result.bundleId}
              </p>
            </div>
            <div className="mt-7 border-t border-[#d9eaf3] pt-7 text-left">
              <p className="mono-label text-[#2f6f95]">
                Student re-check window
              </p>
              <h2 className="mt-2 font-display text-3xl">Request a review.</h2>
              {requested ? (
                <p className="mt-4 rounded-xl bg-[#e5f4fc] p-4 text-sm leading-6 text-[#2f7898]">
                  Your request is recorded and will be routed to the assigned
                  re-checker.
                </p>
              ) : (
                <form
                  onSubmit={event => {
                    event.preventDefault();
                    request.mutate({
                      verificationToken: params?.token ?? "",
                      studentName,
                      candidateId,
                      dateOfBirth,
                      reason,
                    });
                  }}
                  className="mt-4 space-y-3"
                >
                  <input
                    required
                    value={studentName}
                    onChange={event => setStudentName(event.target.value)}
                    placeholder="Student name (as registered)"
                    className="h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm"
                  />
                  <input required value={candidateId} onChange={event => setCandidateId(event.target.value)} placeholder="Candidate ID / roll number" className="h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" />
                  <label className="block text-xs text-[#6b8190]">Date of birth<input required type="date" value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" /></label>
                  <textarea
                    required
                    minLength={10}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder="Explain what should be reviewed"
                    className="min-h-24 w-full rounded-xl border border-[#d9eaf3] p-3 text-sm"
                  />
                  <button
                    disabled={request.isPending}
                    className="w-full rounded-xl bg-[#163044] py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Submit re-check request
                  </button>
                </form>
              )}
            </div>
          </>
        ) : (
          <>
            <ShieldX className="mx-auto text-[#b64c40]" size={42} />
            <p className="mono-label mt-6 text-[#b64c40]">
              Verification unavailable
            </p>
            <h1 className="mt-3 font-display text-5xl">Record not verified.</h1>
            <p className="mt-5 text-sm leading-6 text-[#6b8190]">
              {result.message ??
                "This QR token does not correspond to a finalized Drishti bundle."}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
