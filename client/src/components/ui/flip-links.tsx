import type { ReactNode } from "react";
import { Link } from "wouter";

type FlipLinkProps = {
  children: string;
  href: string;
};

const journeyLinks = [
  { label: "SCANNED", href: "#workflow" },
  { label: "EVALUATED", href: "#controls" },
  { label: "VERIFIED", href: "#record" },
  { label: "TRUSTED", href: "/role-selection" },
] as const;

/** A focused closing statement for the public Drishti landing page. */
export function FlipLinksSection() {
  return (
    <section
      aria-labelledby="journey-heading"
      className="bg-[#eef7fc] px-5 py-16 sm:px-8 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-7xl text-center">
        <div className="mx-auto max-w-2xl">
          <p className="mono-label text-[#2f6f95]">
            Drishti / Evaluation system
          </p>
          <h2
            id="journey-heading"
            className="mt-4 max-w-xl font-display text-4xl leading-[.95] text-[#163044] sm:text-5xl"
          >
            Every paper deserves a mark you can trust.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[#587181] sm:text-base">
            From scanned pages to verified evaluation.
          </p>
        </div>

        <nav aria-label="Explore the Drishti journey" className="mt-12 sm:mt-16">
          <ul className="grid justify-items-center gap-3 sm:gap-4">
            {journeyLinks.map(link => (
              <li key={link.label}>
                <FlipLink href={link.href}>{link.label}</FlipLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

function FlipLink({ children, href }: FlipLinkProps) {
  const linkClassName =
    "drishti-flip-link group relative block w-fit max-w-full overflow-hidden font-sans text-4xl font-extrabold leading-[.8] text-[#163044] transition-colors duration-200 hover:text-[#176d98] focus-visible:text-[#176d98] sm:text-6xl md:text-7xl lg:text-8xl";
  const content = <FlipLinkContent label={children} />;

  if (href.startsWith("#")) {
    return (
      <a href={href} className={linkClassName} aria-label={children}>
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={linkClassName} aria-label={children}>
      {content}
    </Link>
  );
}

function FlipLinkContent({ label }: { label: string }): ReactNode {
  return (
    <>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex whitespace-nowrap">
        {label.split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="drishti-flip-link__letter drishti-flip-link__top inline-block"
            style={{ transitionDelay: `${index * 22}ms` }}
          >
            {letter}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="absolute inset-0 flex whitespace-nowrap">
        {label.split("").map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="drishti-flip-link__letter drishti-flip-link__bottom inline-block"
            style={{ transitionDelay: `${index * 22}ms` }}
          >
            {letter}
          </span>
        ))}
      </span>
    </>
  );
}
