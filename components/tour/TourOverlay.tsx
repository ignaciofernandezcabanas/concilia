"use client";

import { useEffect, useState } from "react";

interface TourOverlayProps {
  targetRect: { top: number; left: number; width: number; height: number } | null;
  padding?: number;
  onClickOutside: () => void;
}

export default function TourOverlay({ targetRect, padding = 8, onClickOutside }: TourOverlayProps) {
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () =>
      setViewportSize({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      });
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!viewportSize.w) return null;

  const cutout = targetRect
    ? {
        x: targetRect.left - padding,
        y: targetRect.top - padding,
        w: targetRect.width + padding * 2,
        h: targetRect.height + padding * 2,
      }
    : null;

  return (
    <svg
      className="tour-overlay"
      onClick={onClickOutside}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: viewportSize.w,
        height: viewportSize.h,
        zIndex: 50,
        pointerEvents: "auto",
      }}
    >
      <defs>
        <mask id="tour-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          {cutout && (
            <rect
              x={cutout.x}
              y={cutout.y}
              width={cutout.w}
              height={cutout.h}
              rx="10"
              ry="10"
              fill="black"
              style={{ transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
            />
          )}
        </mask>
        {cutout && (
          <filter id="tour-glow">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>

      {/* Dark overlay with cutout */}
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.5)"
        mask="url(#tour-spotlight-mask)"
      />

      {/* Soft teal glow ring around cutout */}
      {cutout && (
        <rect
          x={cutout.x - 2}
          y={cutout.y - 2}
          width={cutout.w + 4}
          height={cutout.h + 4}
          rx="12"
          ry="12"
          fill="none"
          stroke="rgba(13,148,136,0.35)"
          strokeWidth="2"
          filter="url(#tour-glow)"
          style={{ transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      )}
    </svg>
  );
}
