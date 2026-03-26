"use client";

import { useState, useEffect, useCallback } from "react";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function useTourTarget(selector: string | null) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    if (!selector) {
      setRect(null);
      setReady(false);
      return;
    }
    const el = document.querySelector(`[data-tour="${selector}"]`);
    if (!el) {
      setRect(null);
      setReady(false);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({
      top: r.top + window.scrollY,
      left: r.left + window.scrollX,
      width: r.width,
      height: r.height,
    });
    setReady(true);
  }, [selector]);

  useEffect(() => {
    if (!selector) return;

    // Try measuring immediately
    measure();

    // If element not found, observe DOM for it
    const observer = new MutationObserver(() => {
      const el = document.querySelector(`[data-tour="${selector}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Wait for scroll to settle, then measure
        setTimeout(measure, 350);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also measure on scroll and resize
    const handleUpdate = () => measure();
    window.addEventListener("scroll", handleUpdate, { passive: true });
    window.addEventListener("resize", handleUpdate, { passive: true });

    // Initial delayed measure (for page transitions)
    const timer = setTimeout(measure, 400);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleUpdate);
      window.removeEventListener("resize", handleUpdate);
      clearTimeout(timer);
    };
  }, [selector, measure]);

  return { rect, ready };
}
