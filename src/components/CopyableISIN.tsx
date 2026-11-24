import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyableISINProps {
  isin: string;
  className?: string;
  label?: string;
  showLabel?: boolean;
  variant?: 'badge' | 'pill' | 'subtle' | 'button';
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Reusable component for displaying an ISIN code with one-click copy to clipboard
 * and clear visual feedback.
 */
export const CopyableISIN: React.FC<CopyableISINProps> = ({
  isin,
  className = '',
  label = 'ISIN',
  showLabel = true,
  variant = 'badge',
  size = 'sm',
}) => {
  const [copied, setCopied] = useState(false);

  if (!isin || isin.trim() === '') {
    return null;
  }

  const cleanIsin = isin.trim();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cleanIsin);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = cleanIsin;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      console.warn('[CopyableISIN] Impossibile copiare ISIN:', err);
    }
  };

  const sizeClasses = {
    xs: 'text-[10px] py-0.5 px-1.5 gap-1',
    sm: 'text-xs py-0.5 px-2 gap-1.5',
    md: 'text-xs sm:text-sm py-1 px-2.5 gap-2',
  }[size];

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }[size];

  if (variant === 'subtle') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copiato negli appunti!' : `Clicca per copiare ISIN: ${cleanIsin}`}
        className={`inline-flex items-center font-mono cursor-pointer transition-all group ${
          copied ? 'text-emerald-400' : 'text-slate-400 hover:text-cyan-300'
        } ${className}`}
      >
        {showLabel && <span className="text-slate-500 font-sans mr-1">{label}:</span>}
        <span className="font-semibold">{cleanIsin}</span>
        <span className="ml-1.5 inline-flex items-center">
          {copied ? (
            <span className="flex items-center gap-0.5 text-emerald-400 font-sans text-[10px] font-bold animate-fadeIn">
              <Check className={`${iconSizes} stroke-[3]`} />
              <span>Copiato!</span>
            </span>
          ) : (
            <Copy
              className={`${iconSizes} opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform`}
            />
          )}
        </span>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Copiato!' : `Copia ISIN: ${cleanIsin}`}
        className={`inline-flex items-center rounded-full font-mono transition-all border cursor-pointer select-none ${sizeClasses} ${
          copied
            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-sm shadow-emerald-500/20'
            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:border-cyan-500/50'
        } ${className}`}
      >
        {showLabel && <span className="text-slate-400 font-sans font-medium">{label}:</span>}
        <span className="font-bold tracking-wider">{cleanIsin}</span>
        {copied ? (
          <span className="flex items-center gap-1 text-emerald-300 font-sans font-bold">
            <Check className={`${iconSizes} text-emerald-400 stroke-[3]`} />
            <span className="text-[10px]">Copiato</span>
          </span>
        ) : (
          <Copy className={`${iconSizes} text-slate-400 hover:text-cyan-300`} />
        )}
      </button>
    );
  }

  // Default 'badge' variant
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copiato negli appunti!' : `Clicca per copiare ISIN: ${cleanIsin}`}
      className={`inline-flex items-center rounded-lg font-mono font-medium transition-all border cursor-pointer select-none group shadow-xs ${sizeClasses} ${
        copied
          ? 'bg-emerald-950 text-emerald-300 border-emerald-500/80 shadow-emerald-500/20'
          : 'bg-slate-950/80 hover:bg-slate-900 text-slate-300 hover:text-white border-slate-700/80 hover:border-cyan-500/60'
      } ${className}`}
    >
      {showLabel && (
        <span className="text-slate-400 font-sans font-semibold text-[10px] uppercase tracking-wider">
          {label}
        </span>
      )}
      <span className="font-bold tracking-wider text-slate-100 group-hover:text-cyan-300 transition-colors">
        {cleanIsin}
      </span>
      {copied ? (
        <span className="flex items-center gap-1 text-emerald-400 font-sans font-bold text-[10px] ml-0.5 animate-fadeIn">
          <Check className={`${iconSizes} stroke-[3] text-emerald-400`} />
          <span>Copiato!</span>
        </span>
      ) : (
        <Copy
          className={`${iconSizes} text-slate-400 group-hover:text-cyan-400 group-hover:scale-110 transition-transform ml-0.5`}
        />
      )}
    </button>
  );
};
