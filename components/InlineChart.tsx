"use client";

interface DataPoint {
  label: string;
  value: number;
}

interface InlineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  lineColor?: string;
  areaColor?: string;
  thresholdLine?: number;
  showLabels?: boolean;
}

export default function InlineChart({
  data,
  width = 700,
  height = 200,
  lineColor = "#3b82f6",
  areaColor = "rgba(59,130,246,0.08)",
  thresholdLine,
  showLabels = true,
}: InlineChartProps) {
  if (data.length === 0) return null;

  const PAD = { top: 10, right: 10, bottom: showLabels ? 25 : 10, left: 10 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const values = data.map((d) => d.value);
  const minVal = Math.min(...values, thresholdLine ?? Infinity);
  const maxVal = Math.max(...values, thresholdLine ?? -Infinity);
  const range = maxVal - minVal || 1;

  const yScale = (v: number) => PAD.top + chartH - ((v - minVal) / range) * chartH;
  const xScale = (i: number) =>
    PAD.left + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);

  const points = data.map((d, i) => `${xScale(i)},${yScale(d.value)}`).join(" ");
  const baseY = yScale(Math.max(0, minVal));
  const areaPoints = `${xScale(0)},${baseY} ${points} ${xScale(data.length - 1)},${baseY}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      {/* Threshold line */}
      {thresholdLine != null && (
        <line
          x1={PAD.left}
          y1={yScale(thresholdLine)}
          x2={width - PAD.right}
          y2={yScale(thresholdLine)}
          stroke="#ef4444"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.5"
        />
      )}
      {/* Area */}
      <polygon points={areaPoints} fill={areaColor} />
      {/* Line */}
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2" />
      {/* Dots */}
      {data.map((d, i) => (
        <circle
          key={i}
          cx={xScale(i)}
          cy={yScale(d.value)}
          r="3"
          fill={d.value < (thresholdLine ?? -Infinity) ? "#ef4444" : lineColor}
        />
      ))}
      {/* Labels */}
      {showLabels &&
        data.map((d, i) =>
          i % Math.max(1, Math.floor(data.length / 8)) === 0 ? (
            <text
              key={i}
              x={xScale(i)}
              y={height - 5}
              textAnchor="middle"
              fontSize="9"
              fill="#9ca3af"
            >
              {d.label}
            </text>
          ) : null
        )}
    </svg>
  );
}
