"use client";

import { useEffect, useState } from "react";
import type { TourStep } from "./tour-steps";

interface TourTooltipProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  targetRect: { top: number; left: number; width: number; height: number } | null;
  padding?: number;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

const TOOLTIP_WIDTH = 380;
const TOOLTIP_GAP = 16;

function calcPosition(
  placement: TourStep["placement"],
  target: { top: number; left: number; width: number; height: number },
  padding: number
) {
  const t = {
    x: target.left - padding,
    y: target.top - padding,
    w: target.width + padding * 2,
    h: target.height + padding * 2,
  };

  switch (placement) {
    case "bottom":
      return {
        top: t.y + t.h + TOOLTIP_GAP,
        left: Math.max(16, t.x + t.w / 2 - TOOLTIP_WIDTH / 2),
      };
    case "top":
      return {
        top: t.y - TOOLTIP_GAP - 180,
        left: Math.max(16, t.x + t.w / 2 - TOOLTIP_WIDTH / 2),
      };
    case "right":
      return {
        top: t.y + t.h / 2 - 80,
        left: t.x + t.w + TOOLTIP_GAP,
      };
    case "left":
      return {
        top: t.y + t.h / 2 - 80,
        left: t.x - TOOLTIP_WIDTH - TOOLTIP_GAP,
      };
  }
}

export default function TourTooltip({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  padding = 8,
  onNext,
  onSkip,
  onBack,
}: TourTooltipProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => {
      clearTimeout(t);
      setVisible(false);
    };
  }, [step.id]);

  if (!targetRect) return null;

  const pos = calcPosition(step.placement, targetRect, padding);
  const isLast = stepIndex === totalSteps - 1;
  const isFirst = stepIndex === 0;

  return (
    <div
      className="tour-tooltip"
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: TOOLTIP_WIDTH,
        zIndex: 51,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
          overflow: "hidden",
        }}
      >
        {/* Teal accent bar */}
        <div
          style={{
            height: 3,
            background: "linear-gradient(90deg, #0d9488, #14b8a6)",
            borderRadius: "12px 12px 0 0",
          }}
        />

        <div style={{ padding: "20px 24px 16px" }}>
          {/* Step counter */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: 8,
            }}
          >
            {stepIndex + 1} de {totalSteps}
          </div>

          {/* Title */}
          <h4
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#0f172a",
              margin: "0 0 8px",
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {step.title}
          </h4>

          {/* Body */}
          <p
            style={{
              fontSize: 13,
              color: "#64748b",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {step.body}
          </p>
        </div>

        {/* Actions */}
        <div
          style={{
            padding: "12px 24px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            onClick={onSkip}
            style={{
              fontSize: 12,
              color: "#94a3b8",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px 0",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Saltar tour
          </button>

          <div style={{ display: "flex", gap: 8 }}>
            {!isFirst && (
              <button
                onClick={onBack}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#64748b",
                  background: "none",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "8px 16px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                Atrás
              </button>
            )}
            <button
              onClick={onNext}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#ffffff",
                background: "#0d9488",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {isLast ? "Empezar" : "Siguiente →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
