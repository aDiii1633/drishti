import { ArrowRight, Building2, CheckCircle2, GraduationCap, ScanLine, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

const roles = [
  { title: "Center Admin", detail: "Manage the examination system.", href: "/admin/login", icon: ShieldCheck },
  { title: "School Admin", detail: "Review your school examination intake.", href: "/school-admin/login", icon: Building2 },
  { title: "Evaluator", detail: "Evaluate your assigned answer sheets.", href: "/evaluator/login", icon: CheckCircle2 },
  { title: "Scanner", detail: "Scan and submit answer sheets.", href: "/scanner/login", icon: ScanLine },
  { title: "Student", detail: "View your result and request a re-check.", href: "/student/login", icon: GraduationCap },
];

export default function RoleSelection() {
  return <main className="grain min-h-screen bg-[#f8fcff] px-5 py-8 text-[#163044] sm:px-8 lg:px-12">
    <header className="mx-auto flex max-w-6xl items-center justify-between"><Link href="/" className="flex items-center gap-3" aria-label="Drishti home"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#2f6f95] font-display text-2xl text-white">D</span><span><span className="block font-display text-3xl leading-none">Drishti</span><span className="mono-label mt-1 block text-[#2f6f95]">Examination workspace</span></span></Link><span className="mono-label hidden text-[#6b8190] sm:block">Secure role entry</span></header>
    <section className="mx-auto flex min-h-[calc(100vh-120px)] max-w-6xl items-center py-16"><div className="w-full"><p className="mono-label text-[#2f6f95]">Welcome to Drishti</p><div className="mt-4 flex flex-wrap items-end justify-between gap-6"><div><h1 className="font-display text-6xl leading-[.9] sm:text-7xl">Choose your workspace.</h1><p className="mt-6 max-w-xl text-base leading-7 text-[#587181]">Select the desk that matches your assigned role. Your local password and role permissions are checked before access is granted.</p></div><span className="rounded-full border border-[#c9e2ef] bg-[#eaf6fd] px-3 py-2 mono-label text-[#2f6f95]">Role-isolated desks</span></div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{roles.map(({ title, detail, href, icon: Icon }) => <Link key={title} href={href} className="role-card group flex min-h-52 flex-col rounded-2xl border border-[#d9eaf3] bg-white p-5 shadow-[0_10px_30px_rgba(38,104,139,.05)] focus:outline-none focus:ring-2 focus:ring-[#8fc7e8]"><span className="grid h-11 w-11 place-items-center rounded-xl border border-[#d9eaf3] bg-[#f8fcff] text-[#2f6f95] transition-colors group-hover:border-[#8fc7e8] group-hover:bg-[#eaf6fd]"><Icon size={20} /></span><span className="mt-auto"><span className="block text-lg font-semibold">{title}</span><span className="mt-2 block min-h-10 text-sm leading-5 text-[#6b8190]">{detail}</span><span className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#2f6f95]">Continue <ArrowRight size={14} /></span></span></Link>)}</div>
    </div></section>
  </main>;
}
