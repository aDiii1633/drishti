import { ClipboardCheck, FileCheck2, Flag, Send } from "lucide-react";

const guidance = [
  [
    ClipboardCheck,
    "01 — Before you start",
    "Open only the paper assigned to your account. Confirm the booklet and question-paper details shown in the existing evaluation workspace before entering marks.",
  ],
  [
    FileCheck2,
    "02 — How to check",
    "Review the saved answer-booklet evidence page by page and record marks against the configured marking setup. Keep each saved mark tied to the visible answer evidence.",
  ],
  [
    Flag,
    "03 — Marking guidance",
    "Use the available scheme and question maxima. When evidence is unclear or a page is unusable, preserve the issue for the established review workflow instead of guessing.",
  ],
  [
    Send,
    "04 — Submission",
    "Save every required question, review the recorded total, and submit only when the existing workspace confirms the paper is complete.",
  ],
] as const;

export default function EvaluatorHome() {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="mono-label text-[#2f6f95]">Evaluator</p>
      <h1 className="mt-2 font-display text-5xl">Checking guidelines.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[#6b8190]">
        Workspace guidance for using Drishti. Replace this local guidance with center-approved examination instructions when they are available.
      </p>
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {guidance.map(([Icon, title, copy]) => (
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
