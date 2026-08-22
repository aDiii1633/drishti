import { CircleHelp, ClipboardCheck, Send, TriangleAlert } from "lucide-react";

const helpItems = [
  [ClipboardCheck, "Getting started", "Open Assigned Papers to view only the answer sheets routed to your evaluator account."],
  [CircleHelp, "Checking workflow", "Use Start Checking to open the existing booklet evaluation workspace for that paper."],
  [Send, "Submitting a paper", "Save the required marks in the existing workspace before using its submission action."],
  [TriangleAlert, "Common issues", "If evidence is missing or a page cannot be read, use the established review path and contact your center support contact."],
] as const;

export default function EvaluatorHelp() {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mono-label text-[#2f6f95]">Evaluator</p>
      <h1 className="mt-2 font-display text-5xl">Help.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        Practical workspace assistance. This is not examination-board policy.
      </p>
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {helpItems.map(([Icon, title, copy]) => (
          <article key={title} className="panel rounded-2xl p-5">
            <Icon size={18} className="text-[#2f6f95]" />
            <h2 className="mt-5 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b8190]">{copy}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
