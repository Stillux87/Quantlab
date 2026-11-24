/**
 * QuantLab - View 3: Mercati e Grafici Live (High-Contrast Color-Differentiated Theme)
 * 100% Real verified Yahoo Finance quotes and real OHLCV charts (1h / 4h / 1D) with
 * EMA 20 / EMA 50 overlays, Stop Loss / Take Profit reference lines, and instant test order execution.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Search, RefreshCw, BarChart2, Play } from 'lucide-react';
import { Bar, Timeframe } from '../types';
import { AiAutopilotState, AiLiveTickerSnapshot } from '../types/aiAutopilot';
import { calculateEMA } from '../services/indicators';
import { executeManualVerifiedTrade } from '../services/aiAutopilotClient';

interface LightMarketsChartsViewProps {
  aiState: AiAutopilotState | null;
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
  onOpenBacktestForTicker: (ticker: string, timeframe: Timeframe) => void;
  onRefreshState: () => void;
  onOrderExecuted: () => void;
}

export const LightMarketsChartsView: React.FC<LightMarketsChartsViewProps> = ({
  aiState,
  selectedTicker,
  onSelectTicker,
  onOpenBacktestForTicker,
  onRefreshState,
  onOrderExecuted,
}) => {
  const snapshot = aiState?.marketSnapshot || [];
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState<'ALL' | 'US' | 'EU' | 'BULL'>('ALL');
  const [chartTf, setChartTf] = useState<'1h' | '4h' | '1D'>('1h');
  const [bars, setBars] = useState<Bar[]>([]);
  const [chartError, setChartError] = useState<string | null>(null);
  const [isLoadingBars, setIsLoadingBars] = useState(false);

  const [customSlPct, setCustomSlPct] = useState<number>(1.2);
  const [customTpPct, setCustomTpPct] = useState<number>(2.5);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const activeItem: AiLiveTickerSnapshot | null = useMemo(() => {
    return (
      snapshot.find((s) => s.ticker.toUpperCase() === selectedTicker.toUpperCase()) ||
      snapshot[0] ||
      null
    );
  }, [snapshot, selectedTicker]);

  useEffect(() => {
    if (activeItem) {
      setCustomSlPct(activeItem.suggestedStopLossPct);
      setCustomTpPct(activeItem.suggestedTakeProfitPct);
    }
  }, [activeItem?.ticker]);

  // Fetch strictly REAL historical bars from /api/market/history
  useEffect(() => {
    if (!activeItem) return;
    let mounted = true;
    async function loadRealChart() {
      setIsLoadingBars(true);
      setChartError(null);
      try {
        const res = await fetch(
          `/api/market/history?ticker=${encodeURIComponent(activeItem!.ticker)}&timeframe=${chartTf}`
        );
        const data = await res.json();
        if (!mounted) return;
        if (!res.ok || data.isRealData !== true || !Array.isArray(data.bars) || data.bars.length === 0) {
          setBars([]);
          setChartError(data.error || 'Dati storici reali momentaneamente non disponibili.');
        } else {
          setBars(data.bars.slice(-120));
        }
      } catch {
        if (mounted) {
          setBars([]);
          setChartError('Errore di connessione nel recupero delle candele reali.');
        }
      } finally {
        if (mounted) setIsLoadingBars(false);
      }
    }
    loadRealChart();
    return () => {
      mounted = false;
    };
  }, [activeItem?.ticker, chartTf]);

  const chartData = useMemo(() => {
    if (bars.length === 0) return [];
    const closes = bars.map((b) => b.close);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, Math.min(50, Math.max(10, closes.length - 2)));
    return bars.map((b, i) => ({
      label: chartTf === '1D' ? b.dateStr : b.dateStr.slice(5),
      close: b.close,
      ema20: ema20[i] ? parseFloat(ema20[i]!.toFixed(2)) : undefined,
      ema50: ema50[i] ? parseFloat(ema50[i]!.toFixed(2)) : undefined,
    }));
  }, [bars, chartTf]);

  const filteredList = useMemo(() => {
    return snapshot.filter((item) => {
      if (regionFilter === 'US' && item.currency !== 'USD') return false;
      if (regionFilter === 'EU' && item.currency !== 'EUR') return false;
      if (regionFilter === 'BULL' && item.trendBias !== 'RIALZISTA') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          item.ticker.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [snapshot, regionFilter, search]);

  const handleManualTestOrder = async () => {
    if (!activeItem) return;
    setIsOrdering(true);
    setOrderFeedback(null);
    try {
      const res = await executeManualVerifiedTrade({
        ticker: activeItem.ticker,
        stopLossPct: customSlPct,
        takeProfitPct: customTpPct,
        allocationEur: 1400,
      });
      setOrderFeedback({ ok: true, text: res.message });
      onOrderExecuted();
    } catch (err: any) {
      setOrderFeedback({ ok: false, text: err?.message || 'Ordine non eseguito.' });
    } finally {
      setIsOrdering(false);
    }
  };

  const slLinePrice = activeItem ? parseFloat((activeItem.price * (1 - customSlPct / 100)).toFixed(2)) : 0;
  const tpLinePrice = activeItem ? parseFloat((activeItem.price * (1 + customTpPct / 100)).toFixed(2)) : 0;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Page Heading */}
      <section className="bg-white border border-slate-300/80 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-blue-700">
            Quotazioni reali verificate Yahoo Finance · Nessun prezzo simulato
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 mt-0.5">
            Mercati e Grafici Live
          </h1>
        </div>
        <button
          type="button"
          onClick={onRefreshState}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-semibold text-slate-800 whitespace-nowrap cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Aggiorna prezzi reali</span>
        </button>
      </section>

      {/* 2-Column Split: Left List (5 cols) + Right Live Chart & Action (7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Filterable Real-Time Market List */}
        <div className="lg:col-span-5 bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-100 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca ticker o azienda (es. NVDA, UCG.MI)..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-200/90 rounded-lg">
              {[
                { id: 'ALL', label: 'Tutti' },
                { id: 'US', label: 'USA ($)' },
                { id: 'EU', label: 'Italia (€)' },
                { id: 'BULL', label: 'Rialzisti' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRegionFilter(tab.id as any)}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    regionFilter === tab.id
                      ? 'bg-blue-700 text-white shadow-xs'
                      : 'text-slate-700 hover:text-slate-950'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-200/80 max-h-[620px] overflow-y-auto">
            {filteredList.length === 0 ? (
              <div className="p-6 text-xs text-slate-600 text-center">
                Nessun titolo trovato o feed in caricamento.
              </div>
            ) : (
              filteredList.map((item) => {
                const isSelected = activeItem?.ticker === item.ticker;
                const isPos = item.change24h >= 0;
                return (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => {
                      onSelectTicker(item.ticker);
                      setOrderFeedback(null);
                    }}
                    className={`w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-100/85 ring-1 ring-inset ring-blue-300'
                        : 'odd:bg-white even:bg-slate-50/70 hover:bg-blue-50/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-slate-950">
                          {item.ticker}
                        </span>
                        <span className="text-xs text-slate-600 truncate">{item.name}</span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                        RSI {item.rsi14.toFixed(1)} · Trend{' '}
                        <span
                          className={
                            item.trendBias === 'RIALZISTA'
                              ? 'text-emerald-700 font-bold'
                              : item.trendBias === 'DEBOLE'
                              ? 'text-rose-700 font-bold'
                              : 'text-amber-700 font-semibold'
                          }
                        >
                          {item.trendBias.toLowerCase()}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-sm font-bold tabular-nums text-slate-950">
                        {item.currencySymbol}
                        {item.price.toFixed(2)}
                      </div>
                      <div
                        className={`font-mono text-xs font-bold tabular-nums ${
                          isPos ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isPos ? '+' : ''}
                        {item.change24h.toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Interactive Live Chart + Technical Summary + Manual Real-Price Test Order */}
        <div className="lg:col-span-7 bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
          {!activeItem ? (
            <div className="py-16 text-center text-sm text-slate-600">
              Seleziona un titolo dalla lista per visualizzare il grafico reale.
            </div>
          ) : (
            <>
              {/* Active Instrument Header Band */}
              <div className="px-6 py-5 bg-slate-100/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-blue-700">
                    {activeItem.exchange} · {activeItem.sector} · Valuta {activeItem.currency}
                  </div>
                  <h2 className="text-xl font-bold text-slate-950 mt-0.5">
                    {activeItem.ticker} — {activeItem.name}
                  </h2>
                  <div className="mt-1.5 flex items-baseline gap-3">
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-950">
                      {activeItem.currencySymbol}
                      {activeItem.price.toFixed(2)}
                    </span>
                    <span
                      className={`text-sm font-mono font-bold tabular-nums ${
                        activeItem.change24h >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {activeItem.change24h >= 0 ? '+' : ''}
                      {activeItem.change24h.toFixed(2)}% oggi
                    </span>
                  </div>
                </div>

                {/* Timeframe Segmented Control */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 p-1 bg-slate-200/90 rounded-lg">
                    {(['1h', '4h', '1D'] as const).map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setChartTf(tf)}
                        className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer ${
                          chartTf === tf
                            ? 'bg-blue-700 text-white shadow-xs'
                            : 'text-slate-700 hover:text-slate-950'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenBacktestForTicker(activeItem.ticker, chartTf)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white whitespace-nowrap cursor-pointer"
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Backtest</span>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Real Exchange Chart */}
                <div className="h-[320px] w-full bg-slate-50/70 rounded-lg border border-slate-200 p-2">
                  {isLoadingBars ? (
                    <div className="h-full flex items-center justify-center text-xs font-medium text-slate-600">
                      Caricamento candele reali {chartTf} per {activeItem.ticker}...
                    </div>
                  ) : chartError ? (
                    <div className="h-full flex items-center justify-center text-xs font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-4 text-center">
                      {chartError}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                        <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10, fill: '#475569' }} minTickGap={24} />
                        <YAxis
                          stroke="#64748b"
                          tick={{ fontSize: 11, fill: '#475569' }}
                          domain={['auto', 'auto']}
                          tickFormatter={(v) => `${activeItem.currencySymbol}${Number(v).toFixed(0)}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                            color: '#f8fafc',
                          }}
                          formatter={(value: any, name: any) => [
                            `${activeItem.currencySymbol}${Number(value).toFixed(2)}`,
                            name,
                          ]}
                        />
                        <ReferenceLine
                          y={slLinePrice}
                          stroke="#dc2626"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{
                            value: `SL ${activeItem.currencySymbol}${slLinePrice}`,
                            fill: '#b91c1c',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideBottomRight',
                          }}
                        />
                        <ReferenceLine
                          y={tpLinePrice}
                          stroke="#059669"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          label={{
                            value: `TP ${activeItem.currencySymbol}${tpLinePrice}`,
                            fill: '#047857',
                            fontSize: 11,
                            fontWeight: 700,
                            position: 'insideTopRight',
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="close"
                          name="Prezzo Reale"
                          stroke="#0f172a"
                          strokeWidth={2.25}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="ema20"
                          name="EMA 20"
                          stroke="#2563eb"
                          strokeWidth={1.75}
                          strokeDasharray="3 3"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="ema50"
                          name="EMA 50"
                          stroke="#d97706"
                          strokeWidth={1.75}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Color-Tinted 4-Metric Technical Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-blue-50/80 border border-blue-200/80">
                    <span className="text-blue-800 font-semibold block">RSI (14) 1h</span>
                    <span className="font-mono font-bold text-slate-950 tabular-nums text-sm mt-0.5 block">
                      {activeItem.rsi14.toFixed(1)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-indigo-50/80 border border-indigo-200/80">
                    <span className="text-indigo-800 font-semibold block">Supporto EMA 20</span>
                    <span className="font-mono font-bold text-slate-950 tabular-nums text-sm mt-0.5 block">
                      {activeItem.currencySymbol}
                      {activeItem.ema20.toFixed(2)}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50/85 border border-amber-200/80">
                    <span className="text-amber-900 font-semibold block">Volatilità ATR</span>
                    <span className="font-mono font-bold text-amber-950 tabular-nums text-sm mt-0.5 block">
                      {activeItem.atrPct.toFixed(2)}%
                    </span>
                  </div>
                  <div
                    className={`p-3 rounded-lg border ${
                      activeItem.momentum6hPct >= 0
                        ? 'bg-emerald-50/85 border-emerald-200/80'
                        : 'bg-rose-50/85 border-rose-200/80'
                    }`}
                  >
                    <span
                      className={`font-semibold block ${
                        activeItem.momentum6hPct >= 0 ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      Momentum 6h
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums text-sm mt-0.5 block ${
                        activeItem.momentum6hPct >= 0 ? 'text-emerald-800' : 'text-rose-800'
                      }`}
                    >
                      {activeItem.momentum6hPct >= 0 ? '+' : ''}
                      {activeItem.momentum6hPct.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Quick Manual Test Order with Verified Live Price & Stop Loss */}
                <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <div>
                        <label className="text-rose-800 font-semibold block mb-1">Stop Loss (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.8"
                          max="2.0"
                          value={customSlPct}
                          onChange={(e) => setCustomSlPct(Number(e.target.value))}
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-rose-300 font-mono text-rose-700 font-bold focus:outline-none focus:border-rose-600"
                        />
                      </div>
                      <div>
                        <label className="text-emerald-800 font-semibold block mb-1">Take Profit (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="1.5"
                          max="4.5"
                          value={customTpPct}
                          onChange={(e) => setCustomTpPct(Number(e.target.value))}
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 font-mono text-emerald-700 font-bold focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                      <div className="text-slate-700 font-mono font-semibold tabular-nums pt-4">
                        <span className="text-rose-700">
                          SL {activeItem.currencySymbol}
                          {slLinePrice}
                        </span>{' '}
                        ·{' '}
                        <span className="text-emerald-700">
                          TP {activeItem.currencySymbol}
                          {tpLinePrice}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleManualTestOrder}
                      disabled={isOrdering}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-sm font-semibold shadow-xs whitespace-nowrap cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{isOrdering ? 'Esecuzione...' : `Compra ${activeItem.ticker} (Test Reale)`}</span>
                    </button>
                  </div>

                  {orderFeedback && (
                    <div
                      className={`px-3.5 py-2.5 rounded-lg text-xs font-medium border ${
                        orderFeedback.ok
                          ? 'bg-emerald-100 border-emerald-300 text-emerald-950'
                          : 'bg-rose-100 border-rose-300 text-rose-950'
                      }`}
                    >
                      {orderFeedback.text}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
