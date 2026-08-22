import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

/** Public-site footer only. Authenticated workspaces deliberately use no footer. */
export function LargeNameFooter() {
  return (
    <footer className="border-t border-[#d9eaf3] bg-white px-5 pt-12 sm:px-8 sm:pt-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)] md:gap-12">
          <div>
            <Link href="/" className="flex items-center gap-3" aria-label="Drishti home">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf6fd] text-[#2f6f95]">
                <Sparkles size={18} strokeWidth={1.8} />
              </span>
              <span>
                <span className="block font-display text-3xl leading-none">Drishti</span>
                <span className="mono-label mt-1 block text-[#2f6f95]">
                  Examination workspace
                </span>
              </span>
            </Link>
            <p className="mt-5 max-w-md text-sm leading-6 text-[#587181]">
              Examination intelligence with accountable human review and a
              traceable grading record.
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-6 h-10 border-[#b6d6e8] bg-[#f8fcff] text-[#2f6f95] hover:border-[#75afd0] hover:bg-[#eaf6fd]"
            >
              <Link href="/role-selection">
                Choose a workspace <ArrowUpRight size={15} />
              </Link>
            </Button>
            <p className="mt-7 text-xs text-[#6b8190]">
              © {new Date().getFullYear()} Drishti. Examination intelligence,
              traceable by design.
            </p>
          </div>

          <nav aria-label="Explore Drishti" className="grid grid-cols-2 gap-8 sm:max-w-md sm:grid-cols-3">
            <div>
              <h2 className="text-sm font-semibold text-[#163044]">Explore</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-[#587181]">
                <li><a className="hover:text-[#2f6f95]" href="#workflow">Workflow</a></li>
                <li><a className="hover:text-[#2f6f95]" href="#controls">Controls</a></li>
                <li><a className="hover:text-[#2f6f95]" href="#record">Record</a></li>
              </ul>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#163044]">Access</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-[#587181]">
                <li><Link className="hover:text-[#2f6f95]" href="/role-selection">Role entry</Link></li>
                <li><Link className="hover:text-[#2f6f95]" href="/login">Sign in</Link></li>
              </ul>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <h2 className="text-sm font-semibold text-[#163044]">Principles</h2>
              <ul className="mt-4 space-y-2.5 text-sm text-[#587181]">
                <li>Scheme-bound marks</li>
                <li>Human final decision</li>
                <li>Auditable record</li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="mt-10 overflow-hidden border-t border-[#d9eaf3] pt-5">
          <p
            aria-hidden="true"
            className="select-none text-center font-display text-[clamp(4.5rem,15vw,9rem)] leading-[.72] text-[#e1f1f8]"
          >
            DRISHTI
          </p>
        </div>
      </div>
    </footer>
  );
}
