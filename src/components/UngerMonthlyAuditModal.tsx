/**
 * QuantLab - Unger Monthly Strategy Health & Decay Audit Modal
 * Real-world Andrea Unger methodology for periodic systematic strategy verification.
 */
import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Calendar,
  Layers,
  ArrowRight,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sliders,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { PaperTradingSession, StrategyMonthlyHealthAudit, UngerMonthlyAuditSummary } from '../types';
import { runMonthlyPortfolioAudit } from '../services/ungerAuditService';

interface UngerMonthlyAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions?: PaperTradingSession[];
  activeSessions?: PaperTradingSession[];
  onApplyAction?: (strategyId: string, action: 'REDUCE_SIZE_50' | 'STOP_SYSTEM' | 'MAINTAIN_100') => void;
}

export const UngerMonthlyAuditModal: React.FC<UngerMonthlyAuditModalProps> = ({
  isOpen,
  onClose,
  sessions,
  activeSessions,
  onApplyAction,
}) => {
  const currentSessions = activeSessions || sessions || [];
  const [auditSummary, setAuditSummary] = useState<UngerMonthlyAuditSummary>(() =>
    runMonthlyPortfolioAudit(currentSessions)
  );
  const [selectedAuditIndex, setSelectedAuditIndex] = useState<number>(0);
  const [appliedActions, setAppliedActions] = useState<Record<string, string>>({});

  // Re-run when opened or sessions change
  React.useEffect(() => {
    if (isOpen) {
      setAuditSummary(runMonthlyPortfolioAudit(currentSessions));
    }
  }, [isOpen, currentSessions]);

  if (!isOpen) return null;

  const handleRunFreshAudit = () => {
    const updated = runMonthlyPortfolioAudit(currentSessions);
    setAuditSummary(updated);
  };

  const currentAudit = auditSummary.audits[selectedAuditIndex] || auditSummary.audits[0];

  const handleExecuteAction = (audit: StrategyMonthlyHealthAudit) => {
    if (onApplyAction) {
      onApplyAction(audit.strategyId, audit.recommendedAction);
    }
    setAppliedActions((prev) => ({
      ...prev,
      [audit.strategyId]: audit.recommendedAction,
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl relative my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 shadow-lg">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-400 text-[10px] font-extrabold uppercase tracking-wider border border-amber-800">
                  METODO ANDREA UNGER
                </span>
                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Audit Mensile: {auditSummary.auditDate}
                </span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                Controllo Periodico di Validità & Monitoraggio Degrado Strategie
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-750 text-slate-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Unger Core Concept Callout */}
        <div className="mt-4 p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
          <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-slate-100">
              Perché Andrea Unger verifica le strategie una volta al mese?
            </span>
            <p className="text-slate-400 leading-relaxed">
              Nei mercati reali, nessun algoritmo funziona per sempre con la stessa efficienza. Una revisione mensile valuta se l'<strong>Average Trade</strong> è sufficiente a coprire lo slippage, se il <strong>Max Drawdown storico</strong> è stato violato (regola del limite 1.2x) e se il mercato ha cambiato regime di volatilità.
            </p>
          </div>
        </div>

        {/* Summary Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-5">
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 text-center">
            <span className="text-[11px] text-slate-500 uppercase font-semibold">Strategie Esaminate</span>
            <div className="text-xl font-bold font-mono text-white mt-0.5">
              {auditSummary.totalStrategiesAudited}
            </div>
          </div>
          <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-900/30 text-center">
            <span className="text-[11px] text-emerald-400 uppercase font-semibold flex items-center justify-center gap-1">
              <ShieldCheck className="w-3 h-3" /> In Forma (100%)
            </span>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
              {auditSummary.healthyCount}
            </div>
          </div>
          <div className="p-3.5 bg-slate-950 rounded-xl border border-amber-900/30 text-center">
            <span className="text-[11px] text-amber-400 uppercase font-semibold flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Allerta (50%)
            </span>
            <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
              {auditSummary.warningCount}
            </div>
          </div>
          <div className="p-3.5 bg-slate-950 rounded-xl border border-red-900/30 text-center">
            <span className="text-[11px] text-rose-400 uppercase font-semibold flex items-center justify-center gap-1">
              <TrendingDown className="w-3 h-3" /> Sospendi (0%)
            </span>
            <div className="text-xl font-bold font-mono text-rose-400 mt-0.5">
              {auditSummary.degradedCount}
            </div>
          </div>
        </div>

        {/* Main Content Area with Strategy Selector and Strategy Details */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 custom-scrollbar">
          {auditSummary.audits.length === 0 ? (
            <div className="p-8 bg-slate-950 rounded-2xl text-center text-slate-400 space-y-2">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="font-semibold text-white">Nessuna sessione attiva da sottoporre ad audit</p>
              <p className="text-xs">Avvia una sessione di Paper Trading o un portafoglio per monitorare il ciclo di salute mensile.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Column: Strategy List */}
              <div className="md:col-span-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Seleziona Strategia:
                </span>
                {auditSummary.audits.map((audit, idx) => {
                  const isSelected = idx === selectedAuditIndex;
                  return (
                    <button
                      key={`${audit.strategyId}_${idx}`}
                      onClick={() => setSelectedAuditIndex(idx)}
                      className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-slate-800 border-cyan-500 shadow-md'
                          : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900'
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-xs text-white truncate max-w-[140px]">
                            {audit.instrumentName || audit.instrumentTicker}
                          </span>
                          <span className="px-1.5 py-0.2 rounded bg-cyan-950/60 text-cyan-300 font-mono text-[10px] font-bold">
                            {audit.instrumentTicker}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              audit.overallStatus === 'HEALTHY'
                                ? 'bg-emerald-950 text-emerald-400'
                                : audit.overallStatus === 'WARNING'
                                ? 'bg-amber-950 text-amber-400'
                                : 'bg-red-950 text-red-400'
                            }`}
                          >
                            {audit.overallStatus === 'HEALTHY' ? 'OK' : audit.overallStatus === 'WARNING' ? 'ALLERTA' : 'STOP'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {audit.strategyName}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 text-slate-500 ${isSelected ? 'text-cyan-400' : ''}`} />
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Detailed Diagnostic Card */}
              {currentAudit && (
                <div className="md:col-span-8 bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
                  {/* Instrument & Strategy Header */}
                  <div className="flex items-center justify-between border-b border-slate-850 pb-3 flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-white tracking-tight">
                          {currentAudit.instrumentName || currentAudit.instrumentTicker}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-mono text-xs font-bold border border-cyan-800/60">
                          {currentAudit.instrumentTicker}
                        </span>
                        {currentAudit.timeframe && (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs font-semibold">
                            {currentAudit.timeframe}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Strategia in esame: <strong className="text-slate-200 font-medium">{currentAudit.strategyName}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-start justify-between gap-3 ${
                      currentAudit.overallStatus === 'HEALTHY'
                        ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                        : currentAudit.overallStatus === 'WARNING'
                        ? 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                        : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider block">
                        DIAGNOSI MENSILE UNGER
                      </span>
                      <h4 className="text-base font-extrabold text-white mt-0.5">
                        {currentAudit.overallStatus === 'HEALTHY'
                          ? '🟢 STATO: IN PIENA FORMA (Allocazione 100%)'
                          : currentAudit.overallStatus === 'WARNING'
                          ? '🟡 STATO: ATTENZIONE / DIMEZZA SIZE (Allocazione 50%)'
                          : '🔴 STATO: DEGRADO ACCERTATO (Sospensione 0%)'}
                      </h4>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {currentAudit.ungerPrescription}
                      </p>
                    </div>

                    <button
                      onClick={() => handleExecuteAction(currentAudit)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-extrabold shrink-0 shadow-md transition-all ${
                        appliedActions[currentAudit.strategyId]
                          ? 'bg-slate-800 text-emerald-400 border border-emerald-600'
                          : currentAudit.recommendedAction === 'MAINTAIN_100'
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : currentAudit.recommendedAction === 'REDUCE_SIZE_50'
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      {appliedActions[currentAudit.strategyId] ? (
                        '✓ Azione Applicata'
                      ) : currentAudit.recommendedAction === 'MAINTAIN_100' ? (
                        'Conferma 100% Size'
                      ) : currentAudit.recommendedAction === 'REDUCE_SIZE_50' ? (
                        'Applica Dimezzamento Size'
                      ) : (
                        'Sospendi Strategia'
                      )}
                    </button>
                  </div>

                  {/* 3 Key Unger Diagnostic Pillars */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Pillar 1: Average Trade Check */}
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">1. Capienza Trade Medio</span>
                        <span
                          className={`font-mono font-bold ${
                            currentAudit.avgTradeStatus === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          +{currentAudit.recentAvgTradePct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Benchmark Storico:</span>
                        <span className="font-mono text-slate-300">+{currentAudit.historicalAvgTradePct}%</span>
                      </div>
                      <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        {currentAudit.avgTradeMessage}
                      </p>
                    </div>

                    {/* Pillar 2: Drawdown Tolerance Check */}
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">2. Max Drawdown Tollerato</span>
                        <span
                          className={`font-mono font-bold ${
                            currentAudit.drawdownStatus === 'HEALTHY' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          -{currentAudit.currentDrawdownPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Soglia Max Storico (1.2x):</span>
                        <span className="font-mono text-slate-300">
                          -{(currentAudit.historicalMaxDrawdownPct * 1.2).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                        {currentAudit.drawdownMessage}
                      </p>
                    </div>
                  </div>

                  {/* Pillar 3: Regime Alignment & Suggested Alternatives */}
                  <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">3. Allineamento al Regime di Mercato</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 font-mono font-bold">
                        {currentAudit.regimeAlignment}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs">{currentAudit.regimeMessage}</p>

                    {currentAudit.suggestedAlternative && (
                      <div className="mt-2 p-3 rounded-lg bg-slate-950 border border-amber-800/40 flex items-start gap-2 text-amber-300">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                        <div>
                          <span className="font-bold">Strategia di rimpiazzo consigliata: </span>
                          <span className="text-white font-semibold">
                            {currentAudit.suggestedAlternative.strategyName}
                          </span>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {currentAudit.suggestedAlternative.reason}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info & trigger */}
        <div className="pt-4 mt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-400 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Prossimo check programmato dal sistema:{' '}
              <strong className="text-slate-200 font-mono">{auditSummary.nextScheduledAuditDate}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleRunFreshAudit}
              className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Esegui Audit Subito
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold shadow-lg shadow-cyan-500/20 transition-all"
            >
              Chiudi Check-Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
