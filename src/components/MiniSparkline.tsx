/**
 * QuantLab - Mini Sparkline Component
 * SVG responsive trend line for cards and dashboards
 */
import React from 'react';

interface MiniSparklineProps {
  data?: number[];
  color?: string;
  isPositive?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data = [10, 11, 10.5, 12, 11.8, 13, 12.5, 14, 13.8, 15],
  color,
  isPositive = true,
  width = 120,
  height = 36,
  className = '',
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 4) + 2;
      const y = height - 4 - ((val - min) / range) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const strokeColor = color || (isPositive ? '#10b981' : '#f59e0b');
  const gradientId = `sparkline-grad-${Math.random().toString(36).substring(2, 8)}`;

  return (
    <svg
      width={width}
      height={height}
      className={`overflow-visible ${className}`}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Optional Area fill */}
      <polygon
        points={`2,${height} ${points} ${width - 2},${height}`}
        fill={`url(#${gradientId})`}
      />

      {/* Main trend line */}
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
