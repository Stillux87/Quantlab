/**
 * QuantLab - Strategie View (Screen 2)
 * Strategy ranking & catalog with status filter pills (Tutte, Valide, Da monitorare, Scartate),
 * QuantLab score badges, sparkline charts, and metrics.
 */
import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  TrendingUp,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { Instrument, BacktestResult, Timeframe } from '../types';
import { MiniSparkline } from './MiniSparkline';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

interface StrategyItem {
  ticker: string;
  name: string;
  instrument: Instrument;
  score: number;
  status: 'VALIDA' | 'DA MONITORARE' | 'SCARTATA';
  profitPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sparklineData: number[];
  recommendedStrategy: string;
  timeframe: Timeframe;
}

interface QuantLabStrategiesViewProps {
  batchResult?: any;
  currentInstrument?: Instrument;
  onSelectStrategy: (res: any, timeframe?: Timeframe) => void;
  onLaunchPaperTrading?: (res: any) => void;
  onOpenDiagnostics?: (res: any) => void;
  onOpenRobustness?: (res: any) => void;
  onOpenVerdictModal?: (res: any) => void;
  onBack?: () => void;
}

export const QuantLabStrategiesView: React.FC<QuantLabStrategiesViewProps> = ({
  batchResult,
  currentInstrument,
  onSelectStrategy,
  onLaunchPaperTrading,
  onOpenDiagnostics,
  onOpenRobustness,
  onOpenVerdictModal,
  onBack,
}) => {
  const [filter, setFilter] = useState<'TUTTE' | 'VALIDE' | 'MONITORARE' | 'SCARTATE'>('TUTTE');
  const [sortBy, setSortBy] = useState<'score' | 'profit' | 'drawdown' | 'pf'>('score');

  // Realistic sample strategies for top instruments in the DB
  const rawStrategies: StrategyItem[] = useMemo(() => {
    const enel = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'ENEL.MI') || INSTRUMENTS_DATABASE[0];
    const aapl = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'AAPL') || INSTRUMENTS_DATABASE[1];
    const msft = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'MSFT') || INSTRUMENTS_DATABASE[2];
    const tsla = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'TSLA') || INSTRUMENTS_DATABASE[3];
    const amzn = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'AMZN') || INSTRUMENTS_DATABASE[4];
    const nvda = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'NVDA') || INSTRUMENTS_DATABASE[0];
    const spy = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'SPY') || INSTRUMENTS_DATABASE[1];
    const qqq = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'QQQ') || INSTRUMENTS_DATABASE[2];
    const isp = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'ISP.MI') || INSTRUMENTS_DATABASE[3];
    const race = INSTRUMENTS_DATABASE.find((i) => i.ticker === 'RACE.MI') || INSTRUMENTS_DATABASE[4];

    return [
      {
        ticker: 'ENEL.MI',
        name: 'Enel S.p.A.',
        instrument: enel,
        score: 78,
        status: 'VALIDA',
        profitPct: 18.4,
        maxDrawdownPct: -4.3,
        profitFactor: 1.42,
        sparklineData: [10, 10.4, 10.2, 10.9, 11.2, 11.0, 11.8, 12.2, 12.1, 12.84],
        recommendedStrategy: 'Titan Trend + Volatility Filter',
        timeframe: '1D',
      },
      {
        ticker: 'AAPL',
        name: 'Apple Inc.',
        instrument: aapl,
        score: 74,
        status: 'VALIDA',
        profitPct: 15.7,
        maxDrawdownPct: -5.1,
        profitFactor: 1.36,
        sparklineData: [100, 102, 101, 106, 105, 109, 111, 110, 114, 115.7],
        recommendedStrategy: 'SuperTrend Dynamic Scalper',
        timeframe: '1h',
      },
      {
        ticker: 'MSFT',
        name: 'Microsoft Corporation',
        instrument: msft,
        score: 71,
        status: 'VALIDA',
        profitPct: 12.3,
        maxDrawdownPct: -4.8,
        profitFactor: 1.28,
        sparklineData: [100, 101, 103, 102, 105, 107, 106, 109, 111, 112.3],
        recommendedStrategy: 'Momentum Breakout Multi-Period',
        timeframe: '1h',
      },
      {
        ticker: 'NVDA',
        name: 'NVIDIA Corporation',
        instrument: nvda,
        score: 76,
        status: 'VALIDA',
        profitPct: 24.6,
        maxDrawdownPct: -6.4,
        profitFactor: 1.45,
        sparklineData: [50, 52, 51, 56, 58, 62, 60, 68, 71, 74.6],
        recommendedStrategy: 'Volume Profile Breakout',
        timeframe: '1D',
      },
      {
        ticker: 'SPY',
        name: 'S&P 500 ETF Trust',
        instrument: spy,
        score: 73,
        status: 'VALIDA',
        profitPct: 14.1,
        maxDrawdownPct: -3.9,
        profitFactor: 1.39,
        sparklineData: [100, 101, 102, 104, 106, 105, 108, 110, 112, 114.1],
        recommendedStrategy: 'Titan Mean Reversion Filter',
        timeframe: '1D',
      },
      {
        ticker: 'QQQ',
        name: 'Invesco QQQ Trust',
        instrument: qqq,
        score: 72,
        status: 'VALIDA',
        profitPct: 16.8,
        maxDrawdownPct: -5.7,
        profitFactor: 1.34,
        sparklineData: [100, 103, 102, 107, 106, 111, 110, 114, 115, 116.8],
        recommendedStrategy: 'EMA Confluence Trend',
        timeframe: '1D',
      },
      {
        ticker: 'TSLA',
        name: 'Tesla Inc.',
        instrument: tsla,
        score: 68,
        status: 'DA MONITORARE',
        profitPct: 9.8,
        maxDrawdownPct: -7.2,
        profitFactor: 1.12,
        sparklineData: [100, 98, 102, 97, 104, 101, 106, 103, 108, 109.8],
        recommendedStrategy: 'Volatility Squeeze Pro',
        timeframe: '1h',
      },
      {
        ticker: 'AMZN',
        name: 'Amazon.com Inc.',
        instrument: amzn,
        score: 65,
        status: 'DA MONITORARE',
        profitPct: 8.5,
        maxDrawdownPct: -6.9,
        profitFactor: 1.08,
        sparklineData: [100, 99, 101, 100, 103, 102, 105, 104, 107, 108.5],
        recommendedStrategy: 'RSI Adaptive Reversal',
        timeframe: '1h',
      },
      {
        ticker: 'ISP.MI',
        name: 'Intesa Sanpaolo',
        instrument: isp,
        score: 42,
        status: 'SCARTATA',
        profitPct: -2.4,
        maxDrawdownPct: -11.5,
        profitFactor: 0.88,
        sparklineData: [100, 99, 97, 98, 96, 94, 95, 93, 94, 92.4],
        recommendedStrategy: 'Bollinger Mean Reversion',
        timeframe: '1D',
      },
      {
        ticker: 'RACE.MI',
        name: 'Ferrari N.V.',
        instrument: race,
        score: 46,
        status: 'SCARTATA',
        profitPct: 1.2,
        maxDrawdownPct: -9.8,
        profitFactor: 0.94,
        sparklineData: [100, 98, 99, 97, 101, 99, 98, 100, 99, 101.2],
        recommendedStrategy: 'MACD Zero Lag Cross',
        timeframe: '1D',
      },
    ];
  }, []);

  // Filtered strategies
  const filteredStrategies = useMemo(() => {
    let list = rawStrategies;
    if (filter === 'VALIDE') list = list.filter((s) => s.status === 'VALIDA');
    if (filter === 'MONITORARE') list = list.filter((s) => s.status === 'DA MONITORARE');
    if (filter === 'SCARTATE') list = list.filter((s) => s.status === 'SCARTATA');

    return [...list].sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'profit') return b.profitPct - a.profitPct;
      if (sortBy === 'drawdown') return a.maxDrawdownPct - b.maxDrawdownPct;
      if (sortBy === 'pf') return b.profitFactor - a.profitFactor;
      return 0;
    });
  }, [rawStrategies, filter, sortBy]);

  const counts = {
    total: rawStrategies.length,
    valid: rawStrategies.filter((s) => s.status === 'VALIDA').length,
    monitor: rawStrategies.filter((s) => s.status === 'DA MONITORARE').length,
    rejected: rawStrategies.filter((s) => s.status === 'SCARTATA').length,
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-16">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <h1 className="text-xl font-extrabold text-white tracking-tight">Strategie</h1>
        <div className="w-8" />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
        <button
          onClick={() => setFilter('TUTTE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'TUTTE'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Tutte ({counts.total})
        </button>
        <button
          onClick={() => setFilter('VALIDE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'VALIDE'
              ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Valide ({counts.valid})
        </button>
        <button
          onClick={() => setFilter('MONITORARE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'MONITORARE'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Da monitorare ({counts.monitor})
        </button>
        <button
          onClick={() => setFilter('SCARTATE')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
            filter === 'SCARTATE'
              ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20'
              : 'bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          Scartate ({counts.rejected})
        </button>
      </div>

      {/* Sort row */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span className="font-medium">Ordina per:</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-slate-900/90 border border-slate-800 text-slate-200 rounded-xl px-3 py-1.5 font-medium focus:outline-none focus:border-cyan-500"
        >
          <option value="score">QuantLab Score</option>
          <option value="profit">Profitto %</option>
          <option value="drawdown">Min Max Drawdown</option>
          <option value="pf">Profit Factor</option>
        </select>
      </div>

      {/* List of Strategy Cards */}
      <div className="space-y-3.5">
        {filteredStrategies.map((item) => {
          const isPositive = item.profitPct >= 0;
          return (
            <div
              key={item.ticker}
              onClick={() => onSelectStrategy(item.instrument, item.timeframe)}
              className="bg-[#0b1322] hover:bg-[#0f1a2e] border border-slate-800/80 hover:border-cyan-500/40 rounded-2xl p-4 sm:p-5 transition-all shadow-lg hover:shadow-cyan-500/10 cursor-pointer group relative"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                {/* Ticker & Score */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-base text-white tracking-tight font-mono">
                      {item.ticker}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold tracking-wider uppercase px-2 py-0.5 rounded-full border ${
                        item.status === 'VALIDA'
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                          : item.status === 'DA MONITORARE'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                          : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate max-w-[200px]">
                    {item.name}
                  </p>
                </div>

                {/* Score & Sparkline */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-sm text-cyan-400">
                      {item.score}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">/100</span>
                  </div>
                  <MiniSparkline
                    data={item.sparklineData}
                    isPositive={isPositive}
                    width={90}
                    height={32}
                  />
                </div>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/70 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Profitto
                  </span>
                  <span
                    className={`font-mono font-extrabold ${
                      isPositive ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {isPositive ? '+' : ''}{item.profitPct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Max DD
                  </span>
                  <span className="font-mono font-extrabold text-slate-200">
                    {item.maxDrawdownPct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                    Profit Factor
                  </span>
                  <span className="font-mono font-extrabold text-slate-200">
                    {item.profitFactor.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Hover indicator */}
              <div className="absolute top-4 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
