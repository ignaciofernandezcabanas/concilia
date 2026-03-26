"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/AuthProvider";
import { api } from "@/lib/api-client";
import { TOUR_STEPS } from "./tour-steps";
import { useTourTarget } from "./useTourTarget";
import TourOverlay from "./TourOverlay";
import TourTooltip from "./TourTooltip";

interface TourContextValue {
  active: boolean;
  restart: () => void;
}

const TourContext = createContext<TourContextValue>({
  active: false,
  restart: () => {},
});

export function useTour() {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { session, org } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);

  const currentStep = active ? TOUR_STEPS[stepIndex] : null;
  const selector = currentStep && !navigating ? currentStep.selector : null;
  const { rect, ready } = useTourTarget(selector);

  // Mount check (portal needs document.body)
  useEffect(() => setMounted(true), []);

  // Auto-start: on first load, if user hasn't completed tour (check DB first, then localStorage)
  useEffect(() => {
    if (!session || !org.activeCompanyId) return;
    // DB is the source of truth — if tourCompletedAt is set, tour was completed
    if (org.tourCompletedAt) {
      // Sync localStorage so future checks are fast
      localStorage.setItem("concilia_tour_completed", "true");
      return;
    }
    const completed = localStorage.getItem("concilia_tour_completed");
    if (!completed) {
      // Small delay to let the dashboard render
      const t = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(t);
    }
  }, [session, org.activeCompanyId, org.tourCompletedAt]);

  // Handle page navigation for cross-page steps
  useEffect(() => {
    if (!active || !currentStep) return;
    if (pathname !== currentStep.path) {
      setNavigating(true);
      router.push(currentStep.path);
    }
  }, [active, currentStep, pathname, router]);

  // Detect when navigation completes
  useEffect(() => {
    if (!navigating || !currentStep) return;
    if (pathname === currentStep.path) {
      const t = setTimeout(() => setNavigating(false), 400);
      return () => clearTimeout(t);
    }
  }, [navigating, pathname, currentStep]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") complete();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  const complete = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    localStorage.setItem("concilia_tour_completed", "true");
    api.patch("/api/user/tour", {}).catch(() => {});
  }, []);

  const next = useCallback(() => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      complete();
    }
  }, [stepIndex, complete]);

  const back = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const restart = useCallback(() => {
    setStepIndex(0);
    setActive(true);
    if (pathname !== TOUR_STEPS[0].path) {
      router.push(TOUR_STEPS[0].path);
    }
  }, [pathname, router]);

  const showTour = active && currentStep && ready && rect && !navigating;

  return (
    <TourContext.Provider value={{ active, restart }}>
      {children}
      {mounted &&
        showTour &&
        createPortal(
          <>
            <TourOverlay
              targetRect={rect}
              padding={currentStep.highlightPadding ?? 8}
              onClickOutside={complete}
            />
            <TourTooltip
              step={currentStep}
              stepIndex={stepIndex}
              totalSteps={TOUR_STEPS.length}
              targetRect={rect}
              padding={currentStep.highlightPadding ?? 8}
              onNext={next}
              onSkip={complete}
              onBack={back}
            />
          </>,
          document.body
        )}
    </TourContext.Provider>
  );
}
