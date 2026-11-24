/**
 * QuantLab - Circular Neon Score Gauge Component
 * Visual circular meter inspired by QuantLab UI design system
 */
import React from 'react';

interface CircularScoreGaugeProps {
  score: number; // 0 - 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  statusBadge?: 'VALIDA' | 'DA MONITORARE' | 'SCARTATA' | 'ROBUSTA' | null;
  className?: string;
}

export const CircularScoreGauge: React.FC<CircularScoreGaugeProps> = ({
  score,
  size = 96,
  strokeWidth = 7,
  label = 'QuantLab Score',
  sublabel,
  statusBadge,
  className = '',
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const progressOffset = circumference - (clampedScore / 100) * circumference;

  // Color mapping based on score
  let strokeColor = '#06b6d4'; // cyan-500 default
  let glowColor = 'rgba(6, 182, 212, 0.4)';
  let textColor = 'text-cyan-400';

  if (clampedScore >= 70) {
    strokeColor = '#10b981'; // emerald-500
    glowColor = 'rgba(16, 185, 129, 0.4)';
    textColor = 'text-emerald-400';
  } else if (clampedScore >= 50) {
    strokeColor = '#06b6d4'; // cyan
    glowColor = 'rgba(6, 182, 212, 0.4)';
    textColor = 'text-cyan-400';
  } else if (clampedScore >= 35) {
    strokeColor = '#f59e0b'; // amber
    glowColor = 'rgba(245, 158, 11, 0.4)';
    textColor = 'text-amber-400';
  } else {
    strokeColor = '#ef4444'; // rose
    glowColor = 'rgba(239, 68, 68, 0.4)';
    textColor = 'text-rose-400';
  }

  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          style={{ filter: `drop-shadow(0 0 8px ${glowColor})` }}
        >
          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#1e293b"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Progress Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={progressOffset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-700 ease-out"
          />
        </svg>

        {/* Center Score Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-mono text-xl font-extrabold tracking-tight text-white leading-none">
            {clampedScore}
          </span>
          <span className="text-[10px] text-slate-400 font-mono font-medium leading-tight">
            /100
          </span>
        </div>
      </div>

      {/* Label and Badge (optional side content) */}
      {(label || statusBadge || sublabel) && (
        <div className="flex flex-col">
          {statusBadge && (
            <span
              className={`text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full w-fit mb-1 border ${
                statusBadge === 'VALIDA' || statusBadge === 'ROBUSTA'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/30'
                  : statusBadge === 'DA MONITORARE'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-500/30'
                  : 'bg-rose-950/80 text-rose-300 border-rose-500/30'
              }`}
            >
              ✓ {statusBadge}
            </span>
          )}
          {label && (
            <span className="text-xs font-semibold text-slate-300">
              {label}
            </span>
          )}
          {sublabel && (
            <span className="text-[11px] text-slate-400">
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
