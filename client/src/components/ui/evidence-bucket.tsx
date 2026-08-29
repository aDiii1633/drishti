import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type EvidenceItem = {
  id: number;
  paper: string;
  status: string;
  question: string;
  marks: string;
};

const evidenceItems: EvidenceItem[] = [
  { id: 1, paper: "PAPER 01", status: "SCANNED", question: "Q1", marks: "4/5" },
  { id: 2, paper: "PAPER 02", status: "QR VERIFIED", question: "Q2", marks: "3/5" },
  { id: 3, paper: "PAPER 03", status: "AI EVALUATED", question: "Q3", marks: "5/5" },
  { id: 4, paper: "PAPER 04", status: "TEACHER REVIEW", question: "Q4", marks: "4/5" },
  { id: 5, paper: "PAPER 05", status: "MARKS VERIFIED", question: "Q5", marks: "5/5" },
  { id: 6, paper: "PAPER 06", status: "RECORD AUDITED", question: "Q6", marks: "4/5" },
];

/** Decorative hero visual: verified records cycle into a protected evidence store. */
export function EvidenceBucket() {
  const [activeIndex, setActiveIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const item = evidenceItems[activeIndex];

  useEffect(() => {
    const rotation = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % evidenceItems.length);
    }, 2800);

    return () => window.clearInterval(rotation);
  }, []);

  const initial = shouldReduceMotion
    ? { opacity: 0, y: -14, scale: 0.98 }
    : { opacity: 0, y: -84, scale: 0.86 };
  const exit = shouldReduceMotion
    ? { opacity: 0, y: 92, scale: 0.98 }
    : { opacity: 0, y: 124, scale: 0.84 };

  return (
    <div
      aria-label="Verified answer-sheet records moving into secure storage"
      className="relative mx-auto aspect-[655/352] w-full max-w-[520px]"
    >
      <svg
        viewBox="0 0 655 352"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0 z-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="drishti-store-left" x1="73" y1="14" x2="281" y2="139" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a5a7aa" />
            <stop offset="1" stopColor="#6b6e73" />
          </linearGradient>
          <linearGradient id="drishti-store-right" x1="568" y1="14" x2="374" y2="139" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a5a7aa" />
            <stop offset="1" stopColor="#6b6e73" />
          </linearGradient>
          <linearGradient id="drishti-store-rim" x1="327" y1="43" x2="327" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4c4f54" />
            <stop offset="1" stopColor="#22252a" />
          </linearGradient>
          <filter id="drishti-store-shadow" x="92" y="261" width="470" height="90" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="17" />
          </filter>
          <filter id="drishti-store-flap-shadow" x="31" y="0" width="593" height="206" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#0d1116" floodOpacity="0.28" />
          </filter>
        </defs>

        <ellipse cx="327" cy="307" rx="200" ry="17" fill="#17242e" fillOpacity="0.36" filter="url(#drishti-store-shadow)" />
        <g filter="url(#drishti-store-flap-shadow)">
          <path d="M123 80L171 43L97 13C94 12 92 12 89 14L56 33C48 37 44 40 44 43C45 46 49 48 57 51L123 80Z" fill="url(#drishti-store-left)" />
          <path d="M536 80L488 43L559 14C563 12 565 12 567 12C569 12 571 13 575 15L590 24C604 32 611 36 610 42C610 48 603 51 588 57L536 80Z" fill="url(#drishti-store-right)" />
          <path d="M488 43H172L123 80H536L488 43Z" fill="url(#drishti-store-rim)" />
          <path d="M172 43V80L123 80L172 43Z" fill="#70747a" />
          <path d="M488 43V80L536 80L488 43Z" fill="#70747a" />
        </g>
      </svg>

      <AnimatePresence mode="sync">
        <motion.article
          key={item.id}
          initial={initial}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={exit}
          transition={{ duration: shouldReduceMotion ? 0.3 : 0.56, ease: [0.23, 1, 0.32, 1] }}
          className="absolute left-1/2 top-0 z-10 flex w-[52%] -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#1c1e22]/95 p-2 pr-3 text-white shadow-[0_12px_25px_rgba(15,20,27,.22)]"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-[#31353b] text-[#d8eefb]">
            <ShieldCheck size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[10px] font-semibold leading-none sm:text-xs">{item.status}</span>
            <span className="mt-1 block truncate text-[9px] leading-none text-[#b5bdc6] sm:text-[10px]">
              {item.paper} · {item.question} {item.marks}
            </span>
          </span>
          <FileText size={13} className="ml-auto shrink-0 text-[#9ed1ed]" aria-hidden="true" />
        </motion.article>
      </AnimatePresence>

      <svg
        viewBox="0 0 655 352"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="drishti-store-face" x1="327" y1="79" x2="327" y2="351" gradientUnits="userSpaceOnUse">
            <stop stopColor="#282b30" />
            <stop offset="0.44" stopColor="#191b1f" />
            <stop offset="1" stopColor="#121417" />
          </linearGradient>
          <linearGradient id="drishti-store-front-flap" x1="327" y1="79" x2="327" y2="194" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a7a8aa" />
            <stop offset="1" stopColor="#74767a" />
          </linearGradient>
          <filter id="drishti-store-face-shadow" x="101" y="61" width="454" height="301" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#0c1014" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter="url(#drishti-store-face-shadow)">
          <path d="M513 79H148C136 79 131 79 127 83C124 86 124 92 124 103V327C124 338 124 344 127 348C131 351 136 351 148 351H513C524 351 530 351 533 348C537 344 537 338 537 327V103C537 92 537 86 533 83C530 79 524 79 513 79Z" fill="url(#drishti-store-face)" />
          <path d="M75 164L124 79H536L582 164C588 177 591 183 589 187C586 192 579 192 565 192H91C77 192 70 192 67 187C64 182 68 176 75 164Z" fill="url(#drishti-store-front-flap)" />
          <path d="M124 79H536" stroke="#c3c4c6" strokeOpacity="0.56" strokeWidth="1.5" />
          <path d="M91 192H565" stroke="#36383d" strokeOpacity="0.82" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
