/**
 * QuantLab - View 5: Backtest (High-Contrast Color-Differentiated Theme, 100% Real Historical Bars)
 * Runs deterministic backtests exclusively on verified real Yahoo Finance OHLCV series
 * returned by /api/market/history (never falls back to synthetic bars).
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Play, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { Bar, BacktestResult, Instrument, Timeframe } from '../types';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { ALL_STRATEGIES } from '../services/strategies/registry';
import { runBacktest } from '../services/backtestEngine';

interface LightBacktestViewProps {
  initialTicker: string;
  initialTimeframe: Timeframe;
  onSelectTicker: (ticker: string) => void;
}

const UNIVERSE_PRESETS: Array<{ ticker: string; name: string; currency: 'USD' | 'EUR'; market: string }> = [
  { ticker: 'NVDA', name: 'NVIDIA Corp.', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'AAPL', name: 'Apple Inc.', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'META', name: 'Meta Platforms', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'AMZN', name: 'Amazon.com', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'TSLA', name: 'Tesla Inc.', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', currency: 'USD', market: 'NYSE Arca' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', currency: 'USD', market: 'NASDAQ' },
  { ticker: 'UCG.MI', name: 'UniCredit S.p.A.', currency: 'EUR', market: 'Borsa Italiana' },
  { ticker: 'ENEL.MI', name: 'Enel S.p.A.', currency: 'EUR', market: 'Borsa Italiana' },
  { ticker: 'ISP.MI', name: 'Intesa Sanpaolo', currency: 'EUR', market: 'Borsa Italiana' },
  { ticker: 'ENI.MI', name: 'Eni S.p.A.', currency: 'EUR', market: 'Borsa Italiana' },
  { ticker: 'RACE.MI', name: 'Ferrari N.V.', currency: 'EUR', market: 'Borsa Italiana' },
  { ticker: 'LDO.MI', name: 'Leonardo S.p.A.', currency: 'EUR', market: 'Borsa Italiana' },
];

type PeriodPreset = '3M' | '1Y' | '3Y';

function getDateRangeForPreset(preset: PeriodPreset, timeframe: Timeframe): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  if (preset === '3M') {
    start.setDate(start.getDate() - 90);
  } else if (preset === '1Y') {
    start.setDate(start.getDate() - 365);
  } else {
    start.setDate(start.getDate() - (timeframe === '1D' ? 365 * 3 : 600));
  }
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { startDate: fmt(start), endDate: fmt(end) };
}

function buildInstrumentForTicker(ticker: string, bars: Bar[]): Instrument {
  const existing = INSTRUMENTS_DATABASE.find(
    (i) => i.ticker.toUpperCase() === ticker.toUpperCase()
  );
  const lastPrice = bars[bars.length - 1]?.close || existing?.currentPrice || 0;
  if (existing) {
    return { ...existing, currentPrice: lastPrice };
  }
  const preset = UNIVERSE_PRESETS.find((p) => p.ticker.toUpperCase() === ticker.toUpperCase());
  const isEur = preset?.currency === 'EUR' || ticker.endsWith('.MI') || ticker.endsWith('.DE');
  return {
    id: ticker.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    ticker: ticker.toUpperCase(),
    isin: 'N/A',
    name: preset?.name || ticker.toUpperCase(),
    type: ticker === 'SPY' || ticker === 'QQQ' ? 'ETF' : 'STOCK',
    market: preset?.market || (isEur ? 'Borsa Italiana' : 'NASDAQ / NYSE'),
    exchangeCode: isEur ? 'MIL' : 'US',
    currency: isEur ? 'EUR' : 'USD',
    currencySymbol: isEur ? '€' : '$',
    currentPrice: lastPrice,
    change24h: 0,
    change24hAmount: 0,
    volume24h: bars[bars.length - 1]?.volume || 0,
    sector: 'Mercato Regolamentato',
    description: `${preset?.name || ticker} — Serie storica reale verificata da Yahoo Finance.`,
    dataRange: {
      startDate: bars[0]?.dateStr || '',
      endDate: bars[bars.length - 1]?.dateStr || '',
      totalBarsDaily: bars.length,
    },
    dataQuality: {
      score: 100,
      missingBarsPct: 0,
      duplicateBarsCount: 0,
      volumeCompletenessPct: 100,
      priceAnomalyCount: 0,
      status: 'EXCELLENT',
    },
  };
}

export const LightBacktestView: React.FC<LightBacktestViewProps> = ({
  initialTicker,
  initialTimeframe,
  onSelectTicker,
}) => {
  const [ticker, setTicker] = useState<string>(initialTicker || 'NVDA');
  const [timeframe, setTimeframe] = useState<Timeframe>(
    initialTimeframe === '1h' || initialTimeframe === '4h' || initialTimeframe === '1D'
      ? initialTimeframe
      : '1h'
  );
  const [period, setPeriod] = useState<PeriodPreset>('1Y');
  const [strategyId, setStrategyId] = useState<string>('ai_dynamic_swing_1h');
  const [capital, setCapital] = useState<number>(10000);
  const [chartMode, setChartMode] = useState<'EQUITY' | 'DRAWDOWN'>('EQUITY');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [barCount, setBarCount] = useState<number>(0);

  useEffect(() => {
    if (initialTicker && initialTicker !== ticker) {
      setTicker(initialTicker);
    }
  }, [initialTicker]);

  const tickerOptions = useMemo(() => {
    const map = new Map<string, { ticker: string; name: string; currency: string }>();
    for (const p of UNIVERSE_PRESETS) {
      map.set(p.ticker, { ticker: p.ticker, name: p.name, currency: p.currency });
    }
    for (const inst of INSTRUMENTS_DATABASE) {
      if (!map.has(inst.ticker)) {
        map.set(inst.ticker, { ticker: inst.ticker, name: inst.name, currency: inst.currency });
      }
    }
    return Array.from(map.values());
  }, []);

  const executeBacktest = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const { startDate, endDate } = getDateRangeForPreset(period, timeframe);
      const url = `/api/market/history?ticker=${encodeURIComponent(ticker)}&timeframe=${encodeURIComponent(timeframe)}&startDate=${startDate}&endDate=${endDate}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data?.isRealData !== true || !Array.isArray(data?.bars) || data.bars.length < 30) {
        setResult(null);
        setBarCount(0);
        setErrorMsg(
          data?.error ||
            `Impossibile recuperare dati storici reali verificati per ${ticker} (${timeframe}). Nessun dato simulato è stato generato.`
        );
        return;
      }

      const realBars: Bar[] = data.bars;
      const strategy =
        ALL_STRATEGIES.find((s) => s.definition.id === strategyId) || ALL_STRATEGIES[0];
      const instrument = buildInstrumentForTicker(ticker, realBars);

      const bt = runBacktest(strategy, instrument, timeframe, realBars, strategy.definition.defaultParams, {
        initialCapital: capital,
        commissionPct: 0.05,
        slippagePct: 0.03,
        spreadPct: 0.02,
      });

      setBarCount(realBars.length);
      setResult(bt);
    } catch (e: any) {
      setResult(null);
      setErrorMsg(e?.message || 'Errore di connessione nel recupero delle serie storiche reali.');
    } finally {
      setIsLoading(false);
    }
  }, [ticker, timeframe, period, strategyId, capital]);

  useEffect(() => {
    executeBacktest();
  }, [executeBacktest]);

  const chartData = useMemo(() => {
    if (!result?.equityCurve?.length) return [];
    const pts = result.equityCurve;
    const step = pts.length > 260 ? Math.ceil(pts.length / 260) : 1;
    return pts
      .filter((_, i) => i % step === 0 || i === pts.length - 1)
      .map((p) => ({
        date: p.dateStr?.slice(0, 10) || '',
        equity: Number(p.equity.toFixed(2)),
        benchmark: Number(p.benchmarkEquity.toFixed(2)),
        drawdown: Number((-Math.abs(p.drawdownPct)).toFixed(2)),
      }));
  }, [result]);

  const handleExportCsv = () => {
    if (!result?.trades?.length) return;
    const headers = [
      'N',
      'Ticker',
      'Direzione',
      'Ingresso',
      'Prezzo Ingresso',
      'Uscita',
      'Prezzo Uscita',
      'Quantita',
      'PnL %',
      'PnL €',
      'Motivo Uscita',
    ];
    const rows = result.trades.map((t) => [
      t.tradeNumber,
      t.symbol,
      t.direction,
      t.entryDateStr,
      t.entryPrice.toFixed(4),
      t.exitDateStr,
      t.exitPrice.toFixed(4),
      t.quantity.toFixed(4),
      t.pnlPercent.toFixed(2),
      t.pnlAmount.toFixed(2),
      t.exitReason,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quantlab_backtest_${ticker}_${timeframe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const m = result?.metrics;
  const curSymbol = result?.instrument?.currencySymbol || '$';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <section className="bg-white border border-slate-300/80 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Validazione Storica su Dati Reali Yahoo Finance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mt-0.5">
            Laboratorio Backtest
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Verifica le strategie su candele storiche reali senza dati sintetici, includendo commissioni e slippage realistici.
          </p>
        </div>
        {result && result.trades.length > 0 && (
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Download className="w-4 h-4" />
            Esporta Trade CSV
          </button>
        )}
      </section>

      {/* Parameter Control Bar (Cool Slate-Indigo Tinted Band) */}
      <section className="bg-indigo-50/75 border border-indigo-200 rounded-xl p-5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-indigo-950 mb-1.5">Titolo</label>
            <select
              value={ticker}
              onChange={(e) => {
                setTicker(e.target.value);
                onSelectTicker(e.target.value);
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
            >
              {tickerOptions.map((opt) => (
                <option key={opt.ticker} value={opt.ticker}>
                  {opt.ticker} — {opt.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-950 mb-1.5">Strategia</label>
            <select
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
            >
              {ALL_STRATEGIES.map((s) => (
                <option key={s.definition.id} value={s.definition.id}>
                  {s.definition.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-950 mb-1.5">Timeframe</label>
            <div className="grid grid-cols-3 rounded-lg bg-slate-200/90 p-1">
              {(['1h', '4h', '1D'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    timeframe === tf
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-indigo-950 mb-1.5">Orizzonte</label>
            <div className="grid grid-cols-3 rounded-lg bg-slate-200/90 p-1">
              {(
                [
                  { id: '3M', label: '3 Mesi' },
                  { id: '1Y', label: '1 Anno' },
                  { id: '3Y', label: 'Multi' },
                ] as Array<{ id: PeriodPreset; label: string }>
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={`py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    period === p.id
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-indigo-950 mb-1.5">
                Capitale (€)
              </label>
              <input
                type="number"
                min={1000}
                step={1000}
                value={capital}
                onChange={(e) => setCapital(Math.max(1000, Number(e.target.value) || 10000))}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono font-semibold text-slate-900 tabular-nums focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              type="button"
              onClick={executeBacktest}
              disabled={isLoading}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white shadow-xs disabled:opacity-60 transition-colors cursor-pointer h-[38px]"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Esegui
            </button>
          </div>
        </div>
      </section>

      {/* Error State (Strict Real Data Policy) */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-bold text-rose-900">
              Dati storici reali non disponibili per questa combinazione
            </p>
            <p className="text-sm text-rose-800">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && m && (
        <>
          {/* 4 Color-Differentiated KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className={`rounded-xl p-5 border border-t-[3px] shadow-xs ${
                m.totalReturnPct >= 0
                  ? 'bg-emerald-50/90 border-emerald-200 border-t-emerald-600'
                  : 'bg-rose-50/90 border-rose-200 border-t-rose-600'
              }`}
            >
              <p
                className={`text-xs font-semibold ${
                  m.totalReturnPct >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                Rendimento Netto
              </p>
              <p
                className={`text-2xl font-bold font-mono tabular-nums mt-2 ${
                  m.totalReturnPct >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {m.totalReturnPct >= 0 ? '+' : ''}
                {m.totalReturnPct.toFixed(2)}%
              </p>
              <p className="text-xs text-slate-700 mt-1 tabular-nums font-medium">
                Buy &amp; Hold:{' '}
                {(result.benchmarkMetrics?.totalReturnPct ?? 0) >= 0 ? '+' : ''}
                {(result.benchmarkMetrics?.totalReturnPct ?? 0).toFixed(2)}%
              </p>
            </div>

            <div className="bg-rose-50/80 border border-rose-200 border-t-[3px] border-t-rose-600 rounded-xl p-5 shadow-xs">
              <p className="text-xs font-semibold text-rose-800">Max Drawdown</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-rose-800 mt-2">
                -{Math.abs(m.maxDrawdownPct).toFixed(2)}%
              </p>
              <p className="text-xs text-rose-900/80 mt-1 tabular-nums font-medium">
                CAGR {m.cagrPct >= 0 ? '+' : ''}
                {m.cagrPct.toFixed(1)}% · Vol {m.volatilityPct?.toFixed(1) ?? '—'}%
              </p>
            </div>

            <div className="bg-indigo-50/80 border border-indigo-200 border-t-[3px] border-t-indigo-600 rounded-xl p-5 shadow-xs">
              <p className="text-xs font-semibold text-indigo-800">Win Rate &amp; Operazioni</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-indigo-950 mt-2">
                {m.winRatePct.toFixed(1)}%
              </p>
              <p className="text-xs text-indigo-900/80 mt-1 tabular-nums font-medium">
                {m.totalTrades} trade ({m.winningTrades} vinti · {m.losingTrades} persi)
              </p>
            </div>

            <div className="bg-amber-50/85 border border-amber-200 border-t-[3px] border-t-amber-500 rounded-xl p-5 shadow-xs">
              <p className="text-xs font-semibold text-amber-900">Profit Factor &amp; Sharpe</p>
              <p className="text-2xl font-bold font-mono tabular-nums text-amber-950 mt-2">
                {m.profitFactor.toFixed(2)}
              </p>
              <p className="text-xs text-amber-900/85 mt-1 tabular-nums font-medium">
                Sharpe {m.sharpeRatio.toFixed(2)} · {barCount} candele reali
              </p>
            </div>
          </div>

          {/* Equity Curve vs Benchmark / Drawdown */}
          <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  {chartMode === 'EQUITY'
                    ? `Curva Equity Reale — ${ticker} (${timeframe})`
                    : `Drawdown Storico — ${ticker} (${timeframe})`}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Blu: Strategia · Arancione tratteggiato: Buy &amp; Hold sullo stesso titolo
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-slate-200/90 p-1 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setChartMode('EQUITY')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                    chartMode === 'EQUITY'
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  Equity Curve
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('DRAWDOWN')}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold cursor-pointer ${
                    chartMode === 'DRAWDOWN'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  Drawdown %
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="h-72 w-full bg-slate-50/70 border border-slate-200 rounded-lg p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="btEquityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1D4ED8" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#1D4ED8" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="btDdGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#DC2626" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#DC2626" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#CBD5E1" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickLine={false}
                      axisLine={{ stroke: '#CBD5E1' }}
                      minTickGap={36}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#475569' }}
                      tickLine={false}
                      axisLine={false}
                      width={66}
                      tickFormatter={(v) =>
                        chartMode === 'EQUITY' ? `€${Math.round(v).toLocaleString('it-IT')}` : `${v}%`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#F8FAFC',
                      }}
                      formatter={(value: any, name: any) => {
                        const num = Number(value);
                        if (chartMode === 'DRAWDOWN') return [`${num.toFixed(2)}%`, 'Drawdown'];
                        return [
                          `€${num.toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
                          name === 'equity' ? 'Strategia' : 'Buy & Hold',
                        ];
                      }}
                    />
                    {chartMode === 'EQUITY' ? (
                      <>
                        <Area
                          type="monotone"
                          dataKey="equity"
                          stroke="#1D4ED8"
                          strokeWidth={2.5}
                          fill="url(#btEquityGrad)"
                        />
                        <Line
                          type="monotone"
                          dataKey="benchmark"
                          stroke="#D97706"
                          strokeWidth={1.75}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      </>
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="drawdown"
                        stroke="#DC2626"
                        strokeWidth={2.5}
                        fill="url(#btDdGrad)"
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Trade Blotter with High-Contrast Header & Zebra Striping */}
          <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
            <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950">
                  Registro Operazioni Storiche ({result.trades.length})
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Mostrate le ultime {Math.min(50, result.trades.length)} operazioni in ordine cronologico inverso
                </p>
              </div>
            </div>

            {result.trades.length === 0 ? (
              <p className="p-6 text-sm text-slate-600">
                Nessun segnale operativo scattato nel periodo selezionato con questi parametri.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-200/75 text-xs font-bold text-slate-700">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Ingresso</th>
                      <th className="py-3 px-4">Uscita</th>
                      <th className="py-3 px-4 text-right">Prezzo In</th>
                      <th className="py-3 px-4 text-right">Prezzo Out</th>
                      <th className="py-3 px-4 text-right">Risultato %</th>
                      <th className="py-3 px-4 text-right">P&amp;L (€)</th>
                      <th className="py-3 px-4">Chiusura</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 text-sm">
                    {result.trades
                      .slice()
                      .reverse()
                      .slice(0, 50)
                      .map((t) => (
                        <tr key={t.id} className="odd:bg-white even:bg-slate-50/80 hover:bg-blue-50/60">
                          <td className="py-2.5 px-4 font-mono text-xs text-slate-600 tabular-nums">
                            {t.tradeNumber}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-800 tabular-nums">
                            {t.entryDateStr}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-800 tabular-nums">
                            {t.exitDateStr}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-800 tabular-nums">
                            {curSymbol}
                            {t.entryPrice.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-slate-950 tabular-nums">
                            {curSymbol}
                            {t.exitPrice.toFixed(2)}
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono text-xs font-bold tabular-nums ${
                              t.pnlPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {t.pnlPercent >= 0 ? '+' : ''}
                            {t.pnlPercent.toFixed(2)}%
                          </td>
                          <td
                            className={`py-2.5 px-4 text-right font-mono text-xs font-bold tabular-nums ${
                              t.pnlAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {t.pnlAmount >= 0 ? '+' : ''}€{t.pnlAmount.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-xs font-semibold text-slate-700">
                            {t.exitReason}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
