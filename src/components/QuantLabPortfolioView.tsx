/**
 * QuantLab - Portafoglio View (Screen 8)
 * Portfolio overview inspired by reference design:
 * - Active strategies counter (6/10) with "+" button
 * - Overall performance card (+12.6% Ultimi 12 mesi) with sparkline
 * - Status filter pills (Tutte, Valide, Monitorare, Scartate)
 * - Allocated strategies list with returns, scores, and status tags
 */
import React, { useState } from 'react';
import {
  Plus,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  Briefcase,
  Layers,
} from 'lucide-react';
import { Instrument, PaperTradingSession, Timeframe } from '../types';
import { MiniSparkline } from './MiniSparkline';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

interface PortfolioItem {
  id: string;
  ticker: string;
  name: string;
  returnPct: number;
  score: number;
  status: 'VALIDA' | 'MONITORARE' | 'SCARTATA';
  timeframe: Timeframe;
  strategyName: string;
  iconBg: string;
}

interface QuantLabPortfolioViewProps {
  activeSessions: PaperTradingSession[];
  onSelectInstrument?: (inst: Instrument) => void;
  onOpenNewStrategy?: () => void;
  onNavigateToSession?: (sessionId: string) => void;
  onNavigateToTerminal?: (sessionId?: string) => void;
  onNavigateToSearch?: () => void;
  onLaunchNewPaper?: () => void;
}

export const QuantLabPortfolioView: React.FC<QuantLabPortfolioViewProps> = ({
  activeSessions,
  onSelectInstrument,
  onOpenNewStrategy,
  onNavigateToSession,
  onNavigateToTerminal,
  onNavigateToSearch,
  onLaunchNewPaper,
}) => {
  const [filter, setFilter] = useState<'TUTTE' | 'VALIDE' | 'MONITORARE' | 'SCARTATE'>('TUTTE');

  const defaultItems: PortfolioItem[] = [
    {
      id: 'enel-strat',
      ticker: 'ENEL.MI',
      name: 'Enel S.p.A.',
      returnPct: 18.4,
      score: 78,
      status: 'VALIDA',
      timeframe: '1D',
      strategyName: 'Titan Trend + Volatility Filter',
      iconBg: 'bg-orange-500/20 text-orange-400',
    },
    {
      id: 'aapl-strat',
      ticker: 'AAPL',
      name: 'Apple Inc.',
      returnPct: 15.7,
      score: 74,
      status: 'VALIDA',
      timeframe: '1h',
      strategyName: 'SuperTrend Dynamic Scalper',
      iconBg: 'bg-amber-500/20 text-amber-400',
    },
    {
      id: 'msft-strat',
      ticker: 'MSFT',
      name: 'Microsoft Corp.',
      returnPct: 12.3,
      score: 71,
      status: 'VALIDA',
      timeframe: '1h',
      strategyName: 'Momentum Breakout Pro',
      iconBg: 'bg-blue-500/20 text-blue-400',
    },
    {
      id: 'tsla-strat',
      ticker: 'TSLA',
      name: 'Tesla Inc.',
      returnPct: 9.8,
      score: 68,
      status: 'MONITORARE',
      timeframe: '1h',
      strategyName: 'Volatility Squeeze Pro',
      iconBg: 'bg-red-500/20 text-red-400',
    },
    {
      id: 'amzn-strat',
      ticker: 'AMZN',
      name: 'Amazon.com Inc.',
      returnPct: 8.5,
      score: 65,
      status: 'MONITORARE',
      timeframe: '1h',
      strategyName: 'RSI Adaptive Reversal',
      iconBg: 'bg-sky-500/20 text-sky-400',
    },
    {
      id: 'googl-strat',
      ticker: 'GOOGL',
      name: 'Alphabet Inc.',
      returnPct: 6.2,
      score: 62,
      status: 'MONITORARE',
      timeframe: '1D',
      strategyName: 'Trend Confluence Master',
      iconBg: 'bg-emerald-500/20 text-emerald-400',
    },
  ];

  const filteredItems = defaultItems.filter((item) => {
    if (filter === 'VALIDE') return item.status === 'VALIDA';
    if (filter === 'MONITORARE') return item.status === 'MONITORARE';
    if (filter === 'SCARTATE') return item.status === 'SCARTATA';
    return true;
  });

  const activeCount = 6;
  const maxAllowed = 10;

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 font-black text-base shadow-lg shadow-cyan-500/20">
            Q
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Portafoglio</h1>
            <p className="text-xs text-slate-400">
              Strategie attive: <span className="font-mono font-bold text-cyan-400">{activeCount}/{maxAllowed}</span>
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            if (onOpenNewStrategy) onOpenNewStrategy();
            else if (onLaunchNewPaper) onLaunchNewPaper();
          }}
          className="p-2.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-transform active:scale-95 shadow-lg shadow-cyan-500/20 cursor-pointer"
          title="Aggiungi nuova strategia"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Performance Complessiva Card */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400">
              Performance complessiva
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                +12,6%
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Ultimi 12 mesi
              </span>
            </div>
          </div>

          <MiniSparkline
            data={[100, 102, 101, 105, 104, 108, 107, 111, 110, 112.6]}
            isPositive={true}
            width={120}
            height={40}
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setFilter('TUTTE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'TUTTE'
              ? 'bg-cyan-500 text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Tutte
        </button>
        <button
          onClick={() => setFilter('VALIDE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'VALIDE'
              ? 'bg-emerald-500 text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Valide (3)
        </button>
        <button
          onClick={() => setFilter('MONITORARE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'MONITORARE'
              ? 'bg-amber-500 text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Monitorare (3)
        </button>
        <button
          onClick={() => setFilter('SCARTATE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'SCARTATE'
              ? 'bg-rose-500 text-slate-950 shadow-md'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Scartate (0)
        </button>
      </div>

      {/* Strategy Rows */}
      <div className="space-y-3">
        {filteredItems.map((item) => {
          const inst = INSTRUMENTS_DATABASE.find((i) => i.ticker === item.ticker) || INSTRUMENTS_DATABASE[0];
          return (
            <div
              key={item.id}
              onClick={() => onSelectInstrument?.(inst)}
              className="bg-[#0b1322] hover:bg-[#0f1a2e] border border-slate-800/80 rounded-2xl p-4 flex items-center justify-between transition-all cursor-pointer shadow-md group"
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${item.iconBg}`}>
                  {item.ticker.charAt(0)}
                </div>
                <div>
                  <span className="font-mono font-bold text-sm text-white block">
                    {item.ticker}
                  </span>
                  <span className="text-[11px] text-slate-400 block truncate max-w-[140px] sm:max-w-[200px]">
                    {item.name}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="font-mono font-bold text-sm text-emerald-400 block">
                    +{item.returnPct.toFixed(1)}%
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {item.score}/100
                  </span>
                </div>

                <span
                  className={`text-[9px] font-extrabold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${
                    item.status === 'VALIDA'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {item.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
