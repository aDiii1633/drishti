import { Bot, Loader2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useLocation } from "wouter";
import type { RoleSession } from "../../../server/roleAuth";

const DrishtiAssistantPanel = lazy(() => import("./DrishtiAssistantPanel"));

export default function DrishtiAssistantLauncher({ session }: { session: RoleSession }) {
  const [open, setOpen] = useState(false);
  const [location] = useLocation();
  const checkingWorkspace = location.startsWith("/evaluator/checking/");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open DRISHTI AI Assistant"
        title="Open DRISHTI AI Assistant"
        className={`press fixed z-[70] grid h-12 w-12 place-items-center rounded-full border border-[#b6d6e8] bg-[#163044] text-white shadow-[0_14px_28px_rgba(22,48,68,.24)] transition hover:bg-[#2f6f95] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6f95] ${checkingWorkspace ? "bottom-4 left-4 sm:left-5 lg:left-5" : "bottom-5 right-5"}`}
      >
        <Bot size={21} aria-hidden="true" />
      </button>
      {open ? (
        <Suspense fallback={<div className="fixed bottom-5 right-5 z-[80] grid h-12 w-12 place-items-center rounded-full bg-[#163044] text-white"><Loader2 className="animate-spin" size={18} /></div>}>
          <DrishtiAssistantPanel session={session} route={location} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
