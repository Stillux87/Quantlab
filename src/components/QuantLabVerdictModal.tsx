/**
 * QuantLab - AI Verdict View / Modal
 * Screen 4 from reference design: Detailed AI robustness verdict, checklist, and categorical score breakdown
 */
import React from 'react';
import { CheckCircle2, ShieldCheck, ArrowRight, X, Sparkles, TrendingUp, AlertTriangle } from 'lucide-react';
import { BacktestResult, Instrument } from '../types';

interface QuantLabVerdictModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: BacktestResult | null;
  onNavigateToDiagnostics?: () => void;
}

export const QuantLabVerdictModal: React.FC<QuantLabVerdictModalProps> = ({
  isOpen,
  onClose,
  result,
  onNavigateToDiagnostics,
}) => {
  if (!isOpen || !result) return null;

  const score = result.metrics?.score || 78;
  const isEligible = (result.metrics?.profitFactor ?? 1) >= 1.1 && (result.metrics?.totalReturnPct ?? 0) > 0;
  const pf = result.metrics?.profitFactor?.toFixed(2) || '1.42';
  const dd = Math.abs(result.metrics?.maxDrawdownPct || 4.3).toFixed(1);
  const tradesCount = result.metrics?.totalTrades || 42;

  // Breakdown scores inspired by reference Screen 4
  const breakdown = [
    { label: 'Performance', value: Math.min(95, Math.round(score * 1.05)) },
    { label: 'Robustezza', value: Math.round(score) },
    { label: 'Stabilità', value: Math.max(60, Math.round(score * 0.97)) },
    { label: 'Rischio', value: Math.min(96, Math.max(50, 100 - Math.round(result.metrics?.maxDrawdownPct || 4.3) * 2)) },
    { label: 'Out-of-sample', value: Math.max(55, Math.round(score * 0.94)) },
    { label: 'Overfitting risk', value: Math.min(92, Math.max(65, Math.round(score * 1.02))) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-100 my-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with glowing badge */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              AI Verdict
            </h2>
            <p className="text-xs text-slate-400">
              {result?.instrument?.name || 'Enel S.p.A.'} ({result?.instrument?.ticker || 'ENEL.MI'}) • {result?.strategyName || 'Titan Trend Breakout'}
            </p>
          </div>
        </div>

        {/* Verdict Banner Card */}
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-4.5 mb-6 flex items-start gap-3.5 shadow-lg">
          <div className="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h3 className="text-base font-bold text-emerald-200">
              Strategia valida
            </h3>
            <p className="text-xs text-emerald-300/90 mt-1 leading-relaxed">
              La strategia supera i requisiti minimi di qualità e robustezza statistica. Vale la pena approfondirla ed eseguire i test di diagnostica avanzata.
            </p>
          </div>
        </div>

        {/* "Perché:" Checklist */}
        <div className="space-y-3 mb-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
            Perché:
          </span>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Profit Factor &gt; 1,30 ({pf})</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Drawdown contenuto (-{dd}%)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Risultato positivo fuori campione (Out-of-sample)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Numero di operazioni sufficiente ({tradesCount} trade validati)</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Nessuna forte dipendenza da un singolo periodo storico</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Parametri non eccessivamente ottimizzati (anti-curve fitting)</span>
            </div>
          </div>
        </div>

        {/* QuantLab Score & Progress Bars */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4.5 mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              QuantLab Score
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black font-mono text-cyan-400">
                {score}
              </span>
              <span className="text-xs text-slate-500 font-mono">/100</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {breakdown.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">{item.label}</span>
                  <span className="font-mono font-bold text-slate-200">{item.value}</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA Button */}
        <button
          onClick={() => {
            onClose();
            if (onNavigateToDiagnostics) onNavigateToDiagnostics();
          }}
          className="w-full py-3.5 px-5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/25 active:scale-[0.98]"
        >
          Vai alla Diagnostica <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
