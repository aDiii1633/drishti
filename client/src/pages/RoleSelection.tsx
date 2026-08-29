import {
  ArrowRight,
  Building2,
  CheckCircle2,
  GraduationCap,
  Loader2,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import type { DrishtiRole } from "@shared/drishti";
import { trpc } from "@/lib/trpc";

type RoleCard = {
  role: DrishtiRole;
  title: string;
  detail: string;
  cta: string;
  href: string;
  home: string;
  icon: typeof ShieldCheck;
};

// `operator` is the persisted backend role for the Scanner desk.
const ROLE_CARDS: RoleCard[] = [
  {
    role: "admin",
    title: "Center Admin",
    detail:
      "Manage examinations, question sets, marking schemes, QR codes and evaluation operations.",
    cta: "Continue as Admin",
    href: "/admin/login",
    home: "/admin",
    icon: ShieldCheck,
  },
  {
    role: "evaluator",
    title: "Evaluator",
    detail:
      "Open your assigned answer sheets, review AI evidence and complete digital evaluation.",
    cta: "Continue as Evaluator",
    href: "/evaluator/login",
    home: "/evaluator",
    icon: CheckCircle2,
  },
  {
    role: "operator",
    title: "Scanner / Operator",
    detail:
      "Capture or upload answer sheets and link them to the correct examination by QR.",
    cta: "Continue as Scanner",
    href: "/scanner/login",
    home: "/scanner",
    icon: ScanLine,
  },
  {
    role: "school_admin",
    title: "School Admin",
    detail: "Review your school's answer-sheet intake and published results.",
    cta: "Continue as School Admin",
    href: "/school-admin/login",
    home: "/school-admin",
    icon: Building2,
  },
  {
    role: "student",
    title: "Student",
    detail: "View your result and request a re-check while the window is open.",
    cta: "Continue as Student",
    href: "/student/login",
    home: "/student",
    icon: GraduationCap,
  },
];

export default function RoleSelection() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const access = trpc.session.access.useQuery();
  const [pending, setPending] = useState<DrishtiRole | null>(null);
  const demoEntry = trpc.session.demoEntry.useMutation({
    onSuccess: async (_result, variables) => {
      const card = ROLE_CARDS.find(entry => entry.role === variables.role);
      await utils.session.current.invalidate();
      setLocation(card?.home ?? "/");
    },
    onError: error => {
      setPending(null);
      toast.error(error.message);
    },
  });

  const demoAccess = access.data?.demoAccess === true;
  // Only offer desks that have an active profile behind them.
  const cards = demoAccess
    ? ROLE_CARDS.filter(card => access.data?.roles.includes(card.role))
    : ROLE_CARDS;

  return (
    <main className="grain min-h-screen bg-[#f8fcff] px-5 py-8 text-[#163044] sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="Drishti home"
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-[#2f6f95] font-display text-2xl text-white">
            D
          </span>
          <span>
            <span className="block font-display text-3xl leading-none">
              Drishti
            </span>
            <span className="mono-label mt-1 block text-[#2f6f95]">
              Examination workspace
            </span>
          </span>
        </Link>
        <span className="mono-label hidden text-[#6b8190] sm:block">
          {demoAccess ? "Demo role access" : "Secure role entry"}
        </span>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center py-16">
        <div className="w-full">
          <p className="mono-label text-[#2f6f95]">Welcome to Drishti</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="font-display text-6xl leading-[.9] sm:text-7xl">
                Select your role.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#587181]">
                {demoAccess
                  ? "Choose the desk you want to open. Role entry is credential-free in this environment and takes you straight into that workspace."
                  : "Select the desk that matches your assigned role. Your local password and role permissions are checked before access is granted."}
              </p>
            </div>
            <span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-2 mono-label text-[#2f6f95]">
              Role-isolated desks
            </span>
          </div>

          {access.isLoading ? (
            <div
              className="mt-12 grid place-items-center py-16"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="animate-spin text-[#2f6f95]" />
              <p className="mono-label mt-4 text-[#6b8190]">Loading roles</p>
            </div>
          ) : (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map(({ role, title, detail, cta, href, icon: Icon }) => {
                const busy = pending === role && demoEntry.isPending;
                const cardClass =
                  "role-card group flex min-h-56 flex-col rounded-2xl border border-[#d9eaf3] bg-white p-6 text-left shadow-[0_10px_30px_rgba(38,104,139,.05)] transition-colors hover:border-[#8fc7e8] focus:outline-none focus:ring-2 focus:ring-[#8fc7e8] disabled:opacity-60";
                const body = (
                  <>
                    <span className="grid h-11 w-11 place-items-center rounded-xl border border-[#d9eaf3] bg-[#f8fcff] text-[#2f6f95] transition-colors group-hover:border-[#8fc7e8] group-hover:bg-[#eaf6fd]">
                      <Icon size={20} />
                    </span>
                    <span className="mt-auto">
                      <span className="block text-lg font-semibold">
                        {title}
                      </span>
                      <span className="mt-2 block min-h-14 text-sm leading-5 text-[#6b8190]">
                        {detail}
                      </span>
                      <span className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#2f6f95]">
                        {busy ? "Opening workspace" : cta}
                        {busy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ArrowRight size={14} />
                        )}
                      </span>
                    </span>
                  </>
                );
                return demoAccess ? (
                  <button
                    key={role}
                    type="button"
                    disabled={demoEntry.isPending}
                    aria-label={cta}
                    onClick={() => {
                      setPending(role);
                      demoEntry.mutate({ role });
                    }}
                    className={cardClass}
                  >
                    {body}
                  </button>
                ) : (
                  <Link
                    key={role}
                    href={href}
                    aria-label={cta}
                    className={cardClass}
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
          )}

          {demoAccess ? (
            <p className="mt-8 max-w-3xl rounded-xl border border-[#e3d6bd] bg-[#fbf6ec] p-4 text-xs leading-5 text-[#7a6b52]">
              Demo role access is enabled. No credentials are required and no
              identity is verified — this is for controlled prototype and
              demonstration environments only, and is not production
              authentication.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
