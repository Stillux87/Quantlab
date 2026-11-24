import React from 'react';
import { AlertTriangle, X, ShieldAlert, AlertCircle, ArrowRight } from 'lucide-react';
import { BacktestResult, PaperTradingSession } from '../types';

interface CoherenceWarningModalProps {
  isOpen: boolean;
  session: PaperTradingSession | null;
  backtest: BacktestResult | null;
  errors: string[];
  onClose: () => void;
  onRegenerateCoherentBacktest?: () => void;
}

export const CoherenceWarningModal: React.FC<CoherenceWarningModalProps> = ({
  isOpen,
  session,
  backtest,
  errors,
  onClose,
  onRegenerateCoherentBacktest,
}) => {
  if (!isOpen || !session) return null;

  return (
    <div
      id="coherence-warning-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900 border border-rose-500/50 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Incoerenza Rilevata tra Paper Strategy e Backtest</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono font-bold">
                  BLOCCO SICUREZZA
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Controllo di coerenza automatica fallito: il backtest non corrisponde alla strategia attiva.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error items */}
        <div className="mt-4 space-y-3">
          <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-3.5 text-xs text-rose-200">
            <div className="font-bold flex items-center gap-1.5 text-rose-300 mb-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Dettagli Incoerenza Tecnica:</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 ml-1">
              {errors.map((err, idx) => (
                <li key={idx} className="leading-relaxed font-mono text-[11px]">
                  {err}
                </li>
              ))}
            </ul>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div>
              <div className="text-[10px] font-mono text-cyan-400 uppercase font-bold">Paper Trading Session</div>
              <div className="text-white font-bold mt-1 truncate">{session.strategyName}</div>
              <div className="text-slate-400 font-mono text-[11px]">ID: {session.strategyId}</div>
              <div className="text-slate-400 font-mono text-[11px]">Asset: {session.instrument.ticker}</div>
              <div className="text-slate-400 font-mono text-[11px]">TF: {session.timeframe}</div>
            </div>

            <div className="border-l border-slate-800 pl-3">
              <div className="text-[10px] font-mono text-amber-400 uppercase font-bold">Backtest Collegato</div>
              <div className="text-white font-bold mt-1 truncate">{backtest?.strategyName || 'N/D'}</div>
              <div className="text-slate-400 font-mono text-[11px]">ID: {backtest?.strategyId || 'N/D'}</div>
              <div className="text-slate-400 font-mono text-[11px]">Asset: {backtest?.instrument.ticker || 'N/D'}</div>
              <div className="text-slate-400 font-mono text-[11px]">TF: {backtest?.timeframe || 'N/D'}</div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Per integrità metodologica, il sistema impedisce di presentare come valido un backtest appartenente a una configurazione o strategia differente.
          </p>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
          {onRegenerateCoherentBacktest && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onRegenerateCoherentBacktest();
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-black transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <span>Genera Backtest Coerente Ora</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
