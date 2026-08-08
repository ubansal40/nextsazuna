"use client";

import { useEffect, useState } from "react";

/**
 * True once the site footer is on screen.
 *
 * Anything pinned to the bottom of the viewport has to stand down when the
 * footer arrives, or it sits on top of the footer's own content for as long as
 * the reader is there. The PDP spec states this rule for its mobile buy bar;
 * the floating WhatsApp pill needs it for the same reason, so the rule lives
 * here once rather than in each of them.
 *
 * An IntersectionObserver rather than the spec's per-frame scroll maths: same
 * answer, no work on threads that are not scrolling.
 */
export function useFooterVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      // Matches the spec's 40px lead-in before the footer counts as on screen.
      { rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return visible;
}
