import { clearRoleSession, readRoleSession } from "@/lib/session";
import {
  ClipboardCheck,
  Database,
  FileSearch,
  Gavel,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

// Mirrors the Python drishti-answer-platform nav set exactly: Home, Scan Intake,
// Booklet Marking, AI Deviation Audit, History, plus an admin-only Mongo Console.
// No manual "questions and marks" setup entry (AI reads the paper automatically -
// see ScanIntake's auto-extraction and Marking's AI-recovery action), no Answers/
// Evaluations/Clarity Calibration links.
const navigation = [
  { path: "/dashboard", label: "Home", icon: LayoutDashboard },
  { path: "/dashboard/scan", label: "Scan intake", icon: FileSearch },
  {
    path: "/dashboard/marking",
    label: "Booklet marking",
    icon: ClipboardCheck,
  },
  { path: "/dashboard/audit", label: "AI review", icon: Gavel },
  { path: "/dashboard/history", label: "History", icon: History },
];

export default function DrishtiShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const session = readRoleSession();
  const links =
    session?.role === "admin"
      ? [
          ...navigation,
          { path: "/dashboard/mongo", label: "Mongo Console", icon: Database },
        ]
      : navigation;
  const close = () => setOpen(false);
  const switchRole = () => {
    clearRoleSession();
    setLocation("/login");
  };
  return (
    <div className="min-h-screen grain bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#e7e4df] bg-white transition-transform duration-200 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-6 pt-7 pb-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3"
            onClick={close}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e6c075]/30 bg-[#f7f1e3]">
              <Sparkles size={17} className="text-[#7c5e10]" />
            </span>
            <span>
              <span className="block font-display text-2xl leading-none">
                Drishti
              </span>
              <span className="mono-label mt-1 block text-[#7c5e10]">
                Forensic Console
              </span>
            </span>
          </Link>
          <button
            onClick={close}
            className="lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mono-label mb-3 px-6 text-[#a8a29e]">Teacher workspace</p>
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3">
          {links.map(item => {
            const active = location === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={close}
                className={`press flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold ${active ? "bg-[#f7f1e3] text-[#6f5310]" : "text-[#44403c] hover:bg-[#f8f7f4]"}`}
              >
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition-colors duration-200 ${active ? "border-[#e6c075] bg-[#e6c075] text-[#1c1917]" : "border-[#e7e4df] bg-white text-[#78716c]"}`}
                >
                  <item.icon size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {active && (
                  <span className="pulse-dot ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#e6c075]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[#e7e4df] p-4">
          <div className="rounded-2xl border border-[#e7e4df] bg-[#fafaf9] p-3">
            <div className="flex items-center gap-2">
              <span className="pulse-dot h-2 w-2 shrink-0 rounded-full bg-[#16803d]" />
              <p className="truncate font-display text-lg leading-tight">
                {session?.displayName ?? "Visitor"}
              </p>
            </div>
            <p className="mono-label mt-1 text-[#7c5e10]">
              {session?.role ?? "visitor"}
            </p>
            <button
              onClick={switchRole}
              className="press mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e7e4df] bg-white py-2 text-[#78716c] hover:border-[#e6c075] hover:text-[#7c5e10]"
            >
              <LogOut size={13} />
              <span className="mono-label">Switch role</span>
            </button>
          </div>
        </div>
      </aside>
      {open && (
        <button
          className="fixed inset-0 z-30 bg-[#1c1917]/20 lg:hidden"
          onClick={close}
          aria-label="Close navigation overlay"
        />
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-[70px] items-center justify-between border-b border-[#e7e4df] bg-[#fafaf9]/90 px-5 backdrop-blur">
          <button
            onClick={() => setOpen(true)}
            className="lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="mono-label flex items-center gap-2 rounded-full border border-[#16803d]/25 bg-[#dff5e7] px-2.5 py-1 text-[#16803d]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[#16803d]" />
              System operational
            </span>
          </div>
          <span className="mono-label flex items-center gap-2 rounded-full border border-[#e6c075]/40 bg-[#f7f1e3] px-2.5 py-1 text-[#7c5e10]">
            <QrCode size={13} />
            Verified grading record
          </span>
        </header>
        <main className="px-5 py-7 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
