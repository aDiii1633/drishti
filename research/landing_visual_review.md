# Landing visual verification note

The landing and role-entry screens preserve the intended forensic editorial system: ivory paper, black ink, muted gold, dotted evidence grid, high-contrast serif display type, and procedural labels. The initial GSAP scroll-reveal implementation created oversized blank regions in a full-page capture because the off-screen sections began hidden. The reveal-hidden state was removed; the GSAP scan beam remains, while content stays visible regardless of trigger timing or reduced-motion state.
