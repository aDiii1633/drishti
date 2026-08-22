import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  FileScan,
  Gauge,
  Gavel,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LargeNameFooter } from "@/components/ui/large-name-footer";

gsap.registerPlugin(ScrollTrigger);

const stages = [
  {
    n: "01",
    title: "Scan intake",
    detail: "Booklet & paper paired",
    icon: FileScan,
  },
  {
    n: "02",
    title: "Clarity gate",
    detail: "Page-level edge check",
    icon: Gauge,
  },
  {
    n: "03",
    title: "AI evaluation",
    detail: "Scheme-bound marks",
    icon: Sparkles,
  },
  {
    n: "04",
    title: "Moderation",
    detail: "Deviation audit trail",
    icon: Gavel,
  },
];

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.to(".hero-scan", {
        xPercent: 195,
        duration: 2.6,
        ease: "power2.inOut",
        repeat: -1,
        yoyo: true,
      });
    },
    { scope: root }
  );
  return (
    <div
      ref={root}
      className="grain min-h-screen overflow-hidden bg-[#f8fcff] text-[#163044]"
    >
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#2f6f95] font-display text-xl text-white">
            D
          </span>
          <span className="font-display text-3xl leading-none">Drishti</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm md:flex">
          <a className="nav-link" href="#workflow">
            Workflow
          </a>
          <a className="nav-link" href="#controls">
            Controls
          </a>
          <a className="nav-link" href="#record">
            Record
          </a>
        </nav>
        <Link
          href="/login"
          className="press rounded-full bg-[#2f6f95] px-4 py-2.5 text-sm font-medium text-white"
        >
          Enter a desk
        </Link>
      </header>
      <main>
        <section className="dot-grid relative border-y border-[#d9eaf3]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(143,199,232,.22),transparent_28%),radial-gradient(circle_at_18%_78%,rgba(220,240,250,.8),transparent_24%)]" />
          <div className="relative mx-auto grid min-h-[620px] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-24">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="flex items-center gap-2"
              >
                <span className="h-2 w-2 rounded-full bg-[#2f7898]" />
                <span className="mono-label text-[#2f6f95]">
                  Forensic evaluation environment
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.06 }}
                className="mt-6 max-w-3xl font-display text-[clamp(3.7rem,8vw,7rem)] leading-[.82] tracking-[-.045em]"
              >
                The mark is only the{" "}
                <em className="font-display-italic text-[#2f6f95]">
                  beginning.
                </em>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.16 }}
                className="mt-8 max-w-xl text-base leading-7 text-[#587181]"
              >
                Drishti turns a scanned answer booklet into a reviewable,
                scheme-bound evidence trail. Human judgement remains in control;
                AI highlights what deserves a second look.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
                className="mt-6 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/login"
                  className="press flex items-center gap-2 rounded-full bg-[#2f6f95] px-5 py-3.5 text-sm font-semibold text-white"
                >
                  Start at the control desk <ArrowRight size={16} />
                </Link>
                <a
                  href="#workflow"
                  className="press rounded-full border border-[#d9eaf3] bg-white px-5 py-3.5 text-sm font-medium"
                >
                  Inspect workflow
                </a>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.7,
                delay: 0.14,
                ease: [0.23, 1, 0.32, 1],
              }}
              className="float-soft forensic-border panel relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[2rem] p-5"
            >
              <div className="flex items-center justify-between border-b border-[#d9eaf3] pb-4">
                <div>
                  <p className="mono-label text-[#7f9aaa]">
                    Protected workflow
                  </p>
                  <p className="mt-1 font-display text-2xl">
                    Answer-sheet evidence
                  </p>
                </div>
                <span className="rounded-full bg-[#e5f4fc] px-2.5 py-1 mono-label text-[#2f7898]">
                  controlled
                </span>
              </div>
              <div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-2xl bg-[#e5f2f9] p-5">
                <div className="absolute left-[-100%] top-1/2 h-px w-1/2 bg-[#8fc7e8] shadow-[0_0_15px_5px_rgba(143,199,232,.38)]">
                  <div className="hero-scan h-full w-full bg-[#f3fbff]" />
                </div>
                <div className="flex h-full flex-col justify-between rounded-lg border border-[#c9e2ef] bg-[#f8fcff] p-4">
                  <div className="flex justify-between">
                    <span className="h-2 w-16 rounded bg-[#c9e2ef]" />
                    <span className="h-2 w-7 rounded bg-[#c9e2ef]" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-1.5 w-full rounded bg-[#d7ebf5]" />
                    <div className="h-1.5 w-[82%] rounded bg-[#dceef7]" />
                    <div className="h-1.5 w-[91%] rounded bg-[#dceef7]" />
                    <div className="h-1.5 w-[65%] rounded bg-[#dceef7]" />
                  </div>
                  <div className="flex items-end justify-between">
                    <div className="h-8 w-8 rounded-full border-2 border-[#2f7898]" />
                    <span className="mono-label text-[#6b8190]">
                      QR-bound intake
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-[#eef7fc] p-3">
                  <p className="mono-label text-[#7f9aaa]">Intake</p>
                  <p className="mt-2 text-sm font-semibold">Signed QR</p>
                </div>
                <div className="rounded-xl bg-[#eef7fc] p-3">
                  <p className="mono-label text-[#7f9aaa]">Evaluation</p>
                  <p className="mt-2 text-sm font-semibold">Human final</p>
                </div>
                <div className="rounded-xl bg-[#eef7fc] p-3">
                  <p className="mono-label text-[#7f9aaa]">Record</p>
                  <p className="mt-2 text-sm font-semibold">Audited</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
        <section
          id="record"
          className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:grid-cols-3 sm:px-8 lg:py-20"
        >
          {[
            [
              "Scheme-bound",
              "Marks remain within the registered question maximum.",
            ],
            [
              "Role-isolated",
              "Each desk sees only its authorized records and actions.",
            ],
            ["Traceable", "Every operational transition is stored for audit."],
          ].map(([title, detail]) => (
            <div key={title}>
              <p className="font-display text-3xl">{title}</p>
              <p className="mt-2 text-sm leading-6 text-[#6b8190]">{detail}</p>
            </div>
          ))}
        </section>
        <section id="workflow" className="border-y border-[#d9eaf3] bg-white">
          <div className="reveal-on-scroll mx-auto max-w-7xl px-5 py-16 sm:px-8">
            <div className="max-w-2xl">
              <p className="mono-label text-[#2f6f95]">Chain of custody</p>
              <h2 className="mt-4 font-display text-5xl leading-none">
                Every decision leaves a trail.
              </h2>
            </div>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#d9eaf3] bg-[#d9eaf3] md:grid-cols-4">
              {stages.map(stage => (
                <div key={stage.n} className="bg-white p-6">
                  <div className="flex items-center justify-between">
                    <span className="mono-label text-[#75afd0]">{stage.n}</span>
                    <stage.icon size={18} className="text-[#2f6f95]" />
                  </div>
                  <h3 className="mt-10 text-lg font-semibold">{stage.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#6b8190]">
                    {stage.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="controls"
          className="reveal-on-scroll mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24"
        >
          <div>
            <p className="mono-label text-[#2f6f95]">
              Designed for accountable grading
            </p>
            <h2 className="mt-4 font-display text-5xl leading-none">
              Automation with a human right of reply.
            </h2>
          </div>
          <div className="space-y-5">
            {[
              [
                "Page-level clarity gates",
                "A low variance-of-Laplacian reading is surfaced before the booklet reaches a marker.",
              ],
              [
                "Strict score denominator",
                "Printed paper total wins. An operator total follows; catalog fallback remains explicitly incomplete.",
              ],
              [
                "Moderated divergence",
                "A gap of three or more marks becomes an auditable deviation—not a silent overwrite.",
              ],
            ].map(([title, body]) => (
              <div key={title} className="flex gap-4">
                <CheckCircle2
                  className="mt-1 shrink-0 text-[#2f7898]"
                  size={18}
                />
                <p className="text-sm leading-6 text-[#587181]">
                  <strong className="text-[#163044]">{title}.</strong> {body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <LargeNameFooter />
    </div>
  );
}
