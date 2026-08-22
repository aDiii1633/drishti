import type { RoleSession } from "../../../server/roleAuth";
import {
  Building2,
  Camera,
  CircleHelp,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileSearch,
  FileStack,
  Gavel,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  ScanLine,
  Sparkles,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type NavigationItem = {
  path: string;
  label: string;
  icon: LucideIcon;
  group: string;
  count?: number;
};

const navigation: NavigationItem[] = [
  {
    path: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    group: "Workspace",
  },
  {
    path: "/dashboard/scan",
    label: "Scan intake",
    icon: FileSearch,
    group: "Workspace",
  },
  {
    path: "/dashboard/marking",
    label: "Booklet marking",
    icon: ClipboardCheck,
    group: "Workspace",
  },
  {
    path: "/dashboard/audit",
    label: "AI review",
    icon: Gavel,
    group: "Workspace",
  },
  {
    path: "/dashboard/history",
    label: "History",
    icon: History,
    group: "Workspace",
  },
];

type AdminMetrics = {
  schools: number;
  evaluators: number;
  totalAnswerSheets: number;
  scanned: number;
  assigned: number;
  evaluated: number;
  pendingEvaluation: number;
};

function linksForSession(
  session: RoleSession,
  metrics?: AdminMetrics | null
): NavigationItem[] {
  if (session.role === "admin")
    return [
      {
        path: "/admin",
        label: "Home",
        icon: LayoutDashboard,
        group: "Overview",
      },
      {
        path: "/admin/schools",
        label: "Schools",
        icon: Building2,
        group: "Operations",
        count: metrics?.schools,
      },
      {
        path: "/admin/evaluators",
        label: "Evaluators",
        icon: Users,
        group: "Operations",
        count: metrics?.evaluators,
      },
      {
        path: "/admin/answer-sheets",
        label: "Total answer sheets",
        icon: FileStack,
        group: "Operations",
        count: metrics?.totalAnswerSheets,
      },
      {
        path: "/admin/scanned",
        label: "Scanned",
        icon: ScanLine,
        group: "Operations",
        count: metrics?.scanned,
      },
      {
        path: "/admin/assigned",
        label: "Assigned",
        icon: ClipboardCheck,
        group: "Operations",
        count: metrics?.assigned,
      },
      {
        path: "/admin/evaluated",
        label: "Evaluated",
        icon: FileCheck2,
        group: "Operations",
        count: metrics?.evaluated,
      },
      {
        path: "/admin/pending-evaluation",
        label: "Pending evaluation",
        icon: ClipboardCheck,
        group: "Operations",
        count: metrics?.pendingEvaluation,
      },
      {
        path: "/admin/exams",
        label: "Exam sessions",
        icon: QrCode,
        group: "Configuration",
      },
      {
        path: "/admin/mongo",
        label: "Admin console",
        icon: Database,
        group: "Configuration",
      },
    ];
  if (session.role === "evaluator")
    return [
      {
        path: "/evaluator",
        label: "Home",
        icon: LayoutDashboard,
        group: "Workspace",
      },
      {
        path: "/evaluator/profile",
        label: "Profile",
        icon: UserRound,
        group: "Workspace",
      },
      {
        path: "/evaluator/papers",
        label: "Assigned papers",
        icon: ClipboardCheck,
        group: "Workspace",
      },
      {
        path: "/evaluator/help",
        label: "Help",
        icon: CircleHelp,
        group: "Support",
      },
    ];
  if (session.role === "school_admin")
    return [
      {
        path: "/school-admin",
        label: "School intake",
        icon: Building2,
        group: "Workspace",
      },
    ];
  if (session.role === "student")
    return [
      {
        path: "/student",
        label: "My result",
        icon: FileCheck2,
        group: "Workspace",
      },
    ];
  if (session.role === "operator")
    return [
      {
        path: "/scanner",
        label: "Scan desk",
        icon: Camera,
        group: "Workspace",
      },
    ];
  return navigation;
}

function workspaceLabel(role: RoleSession["role"]) {
  if (role === "admin") return "Center admin";
  if (role === "school_admin") return "School administration";
  if (role === "operator") return "Scanner workspace";
  if (role === "student") return "Student portal";
  if (role === "evaluator") return "Evaluator workspace";
  return "Workspace";
}

function navigationGroups(links: NavigationItem[]) {
  return links.reduce<{ label: string; items: NavigationItem[] }[]>(
    (groups, item) => {
      const group = groups.find(entry => entry.label === item.group);
      if (group) group.items.push(item);
      else groups.push({ label: item.group, items: [item] });
      return groups;
    },
    []
  );
}

export default function DrishtiShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: RoleSession;
}) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const compact = collapsed && !isMobile;
  const isAdminWorkspace = session.role === "admin";
  const adminOverview = trpc.dashboard.adminOverview.useQuery(undefined, {
    enabled: isAdminWorkspace,
    refetchInterval: 3_000,
  });
  const links = linksForSession(session, adminOverview.data?.metrics);
  const groups = navigationGroups(links);
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => setLocation("/role-selection"),
  });
  const signOut = async () => {
    logout.mutate();
  };
  const home =
    session.role === "admin"
      ? "/admin"
      : session.role === "evaluator"
        ? "/evaluator"
        : session.role === "school_admin"
          ? "/school-admin"
          : session.role === "student"
            ? "/student"
            : "/scanner";
  const close = () => setOpen(false);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fcff] text-[#163044]">
      <aside
        aria-label="Primary navigation"
        className={`workspace-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(19rem,calc(100vw-1rem))] flex-col border-r shadow-[12px_0_32px_rgba(23,72,99,0.08)] transition-[width,transform] duration-200 lg:translate-x-0 lg:shadow-none ${compact ? "lg:w-[72px]" : "lg:w-[264px]"} ${open ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"}`}
      >
        <div
          className={`flex items-center border-b border-[#d9eaf3] py-5 ${compact ? "justify-center px-3" : "justify-between px-5"}`}
        >
          <Link
            href={home}
            className="flex min-w-0 items-center gap-3"
            onClick={close}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
              <Sparkles size={17} strokeWidth={1.8} />
            </span>
            <span className={compact ? "hidden" : "min-w-0"}>
              <span className="block font-display text-2xl leading-none">
                Drishti
              </span>
              <span className="mono-label mt-1 block text-[#2f6f95]">
                Forensic Console
              </span>
            </span>
          </Link>
          <div className={compact ? "hidden" : "flex items-center gap-1"}>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="hidden rounded-md p-2 text-[#7893a2] hover:bg-[#f0f8fd] hover:text-[#2f6f95] lg:grid"
              aria-label="Collapse navigation"
              title="Collapse navigation"
            >
              <PanelLeftClose size={17} />
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-md p-2 text-[#7893a2] hover:bg-[#f0f8fd] hover:text-[#2f6f95] lg:hidden"
              aria-label="Close navigation"
            >
              <X size={18} />
            </button>
          </div>
          {compact ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="hidden rounded-md p-2 text-[#7893a2] hover:bg-[#f0f8fd] hover:text-[#2f6f95] lg:grid"
              aria-label="Expand navigation"
              title="Expand navigation"
            >
              <PanelLeftOpen size={17} />
            </button>
          ) : null}
        </div>
        <div
          className={compact ? "hidden" : "border-b border-[#e9f3f8] px-5 py-4"}
        >
          <p className="mono-label text-[#7893a2]">Active workspace</p>
          <p className="mt-2 text-sm font-semibold text-[#2f6f95]">
            {workspaceLabel(session.role)}
          </p>
        </div>
        <nav
          className={`flex-1 overflow-y-auto py-4 ${compact ? "px-2" : "px-3"}`}
        >
          {groups.map((group, index) => (
            <section key={group.label} className={index ? "mt-5" : undefined}>
              <p
                className={
                  compact ? "sr-only" : "mono-label px-3 pb-2 text-[#7893a2]"
                }
              >
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map(item => {
                  const active =
                    location === item.path ||
                    location.startsWith(`${item.path}/`);
                  const link = (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`group flex min-h-10 items-center rounded-lg py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 ${compact ? "justify-center px-2" : "gap-3 px-3"} ${active ? "workspace-active" : "text-[#587181] hover:bg-[#f2f9fd] hover:text-[#2f6f95]"}`}
                    >
                      <item.icon
                        size={17}
                        strokeWidth={1.8}
                        className="shrink-0"
                      />
                      <span
                        className={
                          compact ? "sr-only" : "min-w-0 flex-1 truncate"
                        }
                      >
                        {item.label}
                      </span>
                      {!compact && item.count !== undefined ? (
                        <span className="rounded-full bg-[#eaf6fd] px-2 py-0.5 text-[10px] font-semibold tabular-nums text-[#2f6f95]">
                          {item.count}
                        </span>
                      ) : null}
                      {!compact && active ? (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f7898]" />
                      ) : null}
                    </Link>
                  );

                  return compact ? (
                    <Tooltip key={item.path}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className={`border-t border-[#d9eaf3] ${compact ? "p-2" : "p-3"}`}>
          <div
            className={
              compact
                ? "grid h-10 place-items-center"
                : "rounded-xl bg-[#f3faff] p-3"
            }
          >
            <div
              className={`flex items-center gap-2 ${compact ? "justify-center" : ""}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#2f7898]" />
              <p
                className={
                  compact ? "sr-only" : "truncate text-sm font-semibold"
                }
              >
                {session.displayName}
              </p>
            </div>
            <p
              className={compact ? "hidden" : "mono-label mt-2 text-[#2f6f95]"}
            >
              {session.role === "operator" ? "scanner" : session.role}
            </p>
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Switch role"
              title="Switch role"
              className={
                compact
                  ? "mt-1 grid h-10 w-10 place-items-center rounded-lg text-[#6b8190] hover:bg-[#f3faff] hover:text-[#2f6f95]"
                  : "mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-[#cfe4f0] bg-white py-2 text-xs font-semibold text-[#587181] transition-colors hover:border-[#8fc7e8] hover:text-[#2f6f95]"
              }
            >
              <LogOut size={13} />
              <span className={compact ? "sr-only" : undefined}>
                Switch role
              </span>
            </button>
          </div>
        </div>
      </aside>
      {open ? (
        <button
          className="fixed inset-0 z-30 bg-[#163044]/10 lg:hidden"
          onClick={close}
          aria-label="Close navigation overlay"
        />
      ) : null}
      <div className={compact ? "lg:pl-[72px]" : "lg:pl-[264px]"}>
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#d9eaf3] bg-white/90 px-5 backdrop-blur sm:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-[#587181] lg:hidden"
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 lg:hidden">
            <p className="mono-label text-[#7893a2]">Drishti</p>
            <p className="truncate text-sm font-semibold text-[#2f6f95]">
              {workspaceLabel(session.role)}
            </p>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="flex items-center gap-2 rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-1.5 text-xs font-medium text-[#2f6f95]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#2f7898]" />
              System operational
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-2 rounded-full border border-[#d9eaf3] bg-white px-3 py-1.5 text-xs font-medium text-[#6b8190]">
            <QrCode size={13} />
            <span className="hidden lg:inline">Verified grading record</span>
          </span>
        </header>
        <main className="px-5 py-8 sm:px-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
