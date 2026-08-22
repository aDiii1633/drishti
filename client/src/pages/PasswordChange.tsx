import { trpc } from "@/lib/trpc";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

function destination(role: string) {
  if (role === "admin") return "/admin";
  if (role === "school_admin") return "/school-admin";
  if (role === "evaluator") return "/evaluator";
  if (role === "student") return "/student";
  return "/scanner";
}

export default function PasswordChange() {
  const [, setLocation] = useLocation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const change = trpc.session.completePasswordChange.useMutation({
    onSuccess: ({ session }) => {
      toast.success("Password changed.");
      setLocation(destination(session.role));
    },
    onError: error => toast.error(error.message),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8) return toast.error("Use at least 8 characters.");
    if (newPassword !== confirmPassword) return toast.error("The passwords do not match.");
    change.mutate({ newPassword });
  };
  return <main className="grid min-h-screen place-items-center bg-[#f8fcff] p-6">
    <form onSubmit={submit} className="panel w-full max-w-md rounded-3xl p-8">
      <KeyRound className="text-[#2f6f95]" />
      <p className="mono-label mt-5 text-[#2f6f95]">Account protection</p>
      <h1 className="mt-2 font-display text-4xl">Choose a new password.</h1>
      <p className="mt-3 text-sm leading-6 text-[#6b8190]">Set a new local password before entering your assigned workspace.</p>
      <div className="mt-6 space-y-4">
        <input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} placeholder="New password (8+ characters)" className="h-12 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" />
        <input required minLength={8} type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Confirm new password" className="h-12 w-full rounded-xl border border-[#d9eaf3] px-3 text-sm" />
      </div>
      <button disabled={change.isPending} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#163044] text-sm font-semibold text-white disabled:opacity-50">{change.isPending ? <Loader2 size={16} className="animate-spin" /> : null}Change password</button>
    </form>
  </main>;
}
