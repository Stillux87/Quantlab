/**
 * QuantLab - Robustness Analysis View
 * Screen 6 from reference design: Circular gauge, robustness metrics, Walk Forward & Monte Carlo badges
 */
import React from 'react';
import {
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  TrendingUp,
  Activity,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { BacktestResult, Instrument } from '../types';
import { CircularScoreGauge } from './CircularScoreGauge';

interface QuantLabRobustnessViewProps {
  result?: BacktestResult | null;
  onBack: () => void;
  onOpenVerdictModal?: () => void;
  onNavigateToDiagnostics?: () => void;
  onOpenAuditDetails?: () => void;
}

export const QuantLabRobustnessView: React.FC<QuantLabRobustnessViewProps> = ({
  result,
  onBack,
  onOpenVerdictModal,
  onNavigateToDiagnostics,
  onOpenAuditDetails,
}) => {
  const score = result?.metrics?.score || 78;

  const metrics = [
    { label: 'Out-of-sample', value: 82 },
    { label: 'Stabilità', value: 76 },
    { label: 'Sensibilità parametri', value: 79 },
    { label: 'Sufficienza operazioni', value: 75 },
  ];

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-xl cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Indietro</span>
        </button>
        <div className="text-center">
          <h1 className="text-lg font-extrabold text-white">Robustezza</h1>
          <p className="text-[11px] text-slate-400 font-mono">
            {result?.instrument?.ticker || 'ENEL.MI'} • {result?.strategyName || 'Titan Trend Breakout'}
          </p>
        </div>
        <div className="w-16" />
      </div>

      {/* Main Robustness Gauge Card */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <CircularScoreGauge
            score={score}
            size={104}
            strokeWidth={8}
            statusBadge="ROBUSTA"
          />
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-base font-extrabold text-white">
              Valutazione di Robustezza
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-md">
              La strategia mostra una buona stabilità dei risultati e una solida capacità di adattarsi a condizioni di mercato diverse, superando i filtri anti-overfitting.
            </p>
          </div>
        </div>
      </div>

      {/* Metriche di Robustezza (Progress bars) */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Metriche di robustezza
        </h3>

        <div className="space-y-3.5">
          {metrics.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">{item.label}</span>
                <span className="font-mono font-bold text-cyan-400">{item.value}</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-700"
                  style={{ width: `${item.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Test Aggiuntivi */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Test aggiuntivi
        </h3>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <Activity className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-slate-200">Walk Forward Analysis</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              PASS
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <Sliders className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-slate-200">Monte Carlo Simulation</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              PASS
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-950 text-cyan-400 flex items-center justify-center">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-semibold text-slate-200">Forward Test</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              PASS
            </span>
          </div>
        </div>

        {onOpenAuditDetails && (
          <button
            onClick={onOpenAuditDetails}
            className="w-full mt-2 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            Dettagli Test <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
