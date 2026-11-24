import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart2,
  Info,
  DollarSign,
  Percent,
} from 'lucide-react';
import { BacktestResult, Instrument, Bar } from '../types';

interface DetailedBacktestChartProps {
  result: BacktestResult;
  instrument: Instrument;
  historicalBars?: Bar[];
  defaultTab?: 'TITAN_ECT' | 'EQUITY' | 'DRAWDOWN' | 'PRICE';
}

export const DetailedBacktestChart: React.FC<DetailedBacktestChartProps> = ({
  result,
  instrument,
  historicalBars = [],
  defaultTab = 'TITAN_ECT',
}) => {
  const [activeTab, setActiveTab] = useState<'TITAN_ECT' | 'EQUITY' | 'DRAWDOWN' | 'PRICE'>(defaultTab);
  const [chartScale, setChartScale] = useState<'CURRENCY' | 'PERCENT'>('CURRENCY');

  const curr = instrument.currencySymbol || '€';
  const initialCap = 10000;
  const finalCap = (result.equityCurve && result.equityCurve.length > 0)
    ? result.equityCurve[result.equityCurve.length - 1].equity
    : initialCap + (result.metrics?.totalPnlAmount || 0);

  // Prepare price chart data with entry and exit markers
  const priceChartData = useMemo(() => {
    // Check if historicalBars belongs to this backtest result
    const expectedInitialPrice = result.equityCurve?.[0]?.price;
    const firstBarClose = historicalBars?.[0]?.close;
    const isMismatched =
      !historicalBars ||
      historicalBars.length === 0 ||
      (expectedInitialPrice !== undefined &&
        firstBarClose !== undefined &&
        expectedInitialPrice > 0 &&
        Math.abs(firstBarClose - expectedInitialPrice) / expectedInitialPrice > 0.35);

    if (isMismatched || !historicalBars || historicalBars.length === 0) {
      // Fallback from equity curve price points (strictly preserves authentic backtested asset prices)
      const points = result.equityCurve || [];
      const sampling = Math.max(1, Math.floor(points.length / 250));
      return points
        .filter((_, idx) => idx % sampling === 0 || idx === points.length - 1)
        .map((pt) => {
          const entryTrade = result.trades?.find(
            (t) => Math.abs(t.entryTimestamp - pt.timestamp) < 3600000 * 4
          );
          const exitTrade = result.trades?.find(
            (t) => Math.abs(t.exitTimestamp - pt.timestamp) < 3600000 * 4
          );

          return {
            date: pt.dateStr ? pt.dateStr.split(' ')[0] : '',
            price: pt.price,
            high: pt.price,
            low: pt.price,
            open: pt.price,
            entryMarker: entryTrade ? entryTrade.entryPrice : null,
            exitMarker: exitTrade ? exitTrade.exitPrice : null,
            entryDirection: entryTrade ? entryTrade.direction : null,
            exitPnl: exitTrade ? exitTrade.pnlAmount : null,
          };
        });
    }

    const sampling = Math.max(1, Math.floor(historicalBars.length / 250));
    return historicalBars
      .filter((_, idx) => idx % sampling === 0 || idx === historicalBars.length - 1)
      .map((b) => {
        const entryTrade = result.trades?.find(
          (t) => Math.abs(t.entryTimestamp - b.timestamp) < 3600000 * 4
        );
        const exitTrade = result.trades?.find(
          (t) => Math.abs(t.exitTimestamp - b.timestamp) < 3600000 * 4
        );

        return {
          date: b.dateStr.split(' ')[0],
          price: b.close,
          high: b.high,
          low: b.low,
          open: b.open,
          entryMarker: entryTrade ? entryTrade.entryPrice : null,
          exitMarker: exitTrade ? exitTrade.exitPrice : null,
          entryDirection: entryTrade ? entryTrade.direction : null,
          exitPnl: exitTrade ? exitTrade.pnlAmount : null,
        };
      });
  }, [historicalBars, result.trades, result.equityCurve]);

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
      {/* Chart Navigation Tabs & Scale Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('TITAN_ECT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'TITAN_ECT'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Titan ECT (Filtro Slump)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EQUITY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'EQUITY'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
            <span>Curva Equity Grezza</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('DRAWDOWN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'DRAWDOWN'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
            <span>Underwater Drawdown</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PRICE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'PRICE'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-amber-400" />
            <span>Prezzo & Esecuzioni</span>
          </button>
        </div>

        {/* Right side controls: Scale selector & Capital metrics */}
        <div className="flex items-center gap-3 self-end sm:self-center text-xs">
          {(activeTab === 'TITAN_ECT' || activeTab === 'EQUITY') && (
            <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setChartScale('CURRENCY')}
                className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${
                  chartScale === 'CURRENCY'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {curr} Valore
              </button>
              <button
                type="button"
                onClick={() => setChartScale('PERCENT')}
                className={`px-2 py-1 rounded font-bold cursor-pointer transition-all ${
                  chartScale === 'PERCENT'
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                % Resa
              </button>
            </div>
          )}

          <div className="text-[11px] text-slate-400 font-mono hidden md:block">
            Iniziale: <span className="text-slate-200 font-semibold">{curr}{initialCap.toLocaleString('it-IT')}</span> &bull; Finale:{' '}
            <span className={finalCap >= initialCap ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {curr}{finalCap.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* TAB 1: TITAN ECT (EQUITY CURVE TRADING SLUMP FILTER) */}
      {activeTab === 'TITAN_ECT' && (
        <div className="space-y-4">
          {/* Titan ECT Comparison KPI Strip */}
          {result.titanEct && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-900/80 border border-emerald-500/30 text-xs">
              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Drawdown Grezzo &rarr; Titan ECT</div>
                <div className="font-bold flex items-center gap-1.5 mt-0.5">
                  <span className="line-through text-rose-400">-{result.titanEct.rawMaxDrawdownPct.toFixed(1)}%</span>
                  <span className="text-emerald-400 text-sm font-black">-{result.titanEct.titanMaxDrawdownPct.toFixed(1)}%</span>
                  <span className="text-[10px] text-emerald-300 font-bold">(-{result.titanEct.drawdownReductionPct.toFixed(0)}%)</span>
                </div>
                <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                  Protezione drawdown attivo
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Profit Factor Migliorato</div>
                <div className="font-bold text-white mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-slate-400">{result.titanEct.rawProfitFactor.toFixed(2)}</span>
                  <span className="text-cyan-300 text-sm font-black">&rarr; {result.titanEct.titanProfitFactor.toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Taglio trade in slump
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Operazioni in Slump Evitate</div>
                <div className="text-sm font-bold text-amber-400 mt-0.5">
                  {result.titanEct.tradesAvoidedCount} trade
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Filtro SMA a {result.titanEct.ectWindowTrades} operazioni
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-400 font-semibold uppercase">Operatività a Regime</div>
                <div className="text-sm font-bold text-emerald-300 mt-0.5">
                  {result.titanEct.activeTradeRatioPct.toFixed(0)}% del periodo
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Solo in fasi di mercato sane
                </div>
              </div>
            </div>
          )}

          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.equityCurve} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) =>
                    chartScale === 'PERCENT'
                      ? `${v >= 0 ? '+' : ''}${v}%`
                      : `${curr}${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(value: any, name: any) => {
                    const num = Number(value);
                    if (chartScale === 'PERCENT') {
                      return [`${num >= 0 ? '+' : ''}${num.toFixed(2)}%`, name];
                    }
                    return [
                      `${curr}${num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name,
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'titanEctEquityPct' : 'titanEctEquity'}
                  name="Equity Titan ECT (Filtro Slump)"
                  stroke="#10b981"
                  strokeWidth={2.8}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'equityPct' : 'equity'}
                  name={`${result.strategyName} (Grezza)`}
                  stroke="#06b6d4"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="titanEctSma"
                  name="Media Mobile Equity (Soglia Slump)"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'benchmarkEquityPct' : 'benchmarkEquity'}
                  name={`Buy & Hold ${instrument.ticker}`}
                  stroke="#64748b"
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>
              <strong>Meccanismo Titan ECT (Equity Curve Trading):</strong> Quando l'equity grezza della strategia scende al di sotto della sua media mobile a breve termine, il sistema entra in standby protettivo evitando di eseguire operazioni durante i periodi di drawdown più severi, preservando così il capitale accumulato.
            </span>
          </div>
        </div>
      )}

      {/* TAB 2: RAW EQUITY CURVE */}
      {activeTab === 'EQUITY' && (
        <div className="space-y-3">
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.equityCurve} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) =>
                    chartScale === 'PERCENT'
                      ? `${v >= 0 ? '+' : ''}${v}%`
                      : `${curr}${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 0 })}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(value: any, name: any) => {
                    const num = Number(value);
                    if (chartScale === 'PERCENT') {
                      return [`${num >= 0 ? '+' : ''}${num.toFixed(2)}%`, name];
                    }
                    return [
                      `${curr}${num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                      name,
                    ];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'equityPct' : 'equity'}
                  name={`${result.strategyName} (Strategia)`}
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'benchmarkEquityPct' : 'benchmarkEquity'}
                  name={`Buy & Hold (${instrument.ticker})`}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 3: UNDERWATER DRAWDOWN */}
      {activeTab === 'DRAWDOWN' && (
        <div className="space-y-3">
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.equityCurve} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 0]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                  formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Drawdown']}
                />
                <Area
                  type="monotone"
                  dataKey="drawdownPct"
                  name="Drawdown (%)"
                  stroke="#f43f5e"
                  fill="#f43f5e"
                  fillOpacity={0.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* TAB 4: PRICE CHART WITH ENTRY & EXIT MARKERS */}
      {activeTab === 'PRICE' && (
        <div className="space-y-3">
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceChartData} margin={{ top: 10, right: 15, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `${curr}${v}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#020617',
                    borderColor: '#334155',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey="price"
                  name={`Prezzo ${instrument.ticker}`}
                  stroke="#f8fafc"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="entryMarker"
                  name="Ingresso Posizione (Entry)"
                  stroke="#10b981"
                  strokeWidth={0}
                  dot={{ r: 5, fill: '#10b981', stroke: '#064e3b', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="exitMarker"
                  name="Chiusura Posizione (Exit)"
                  stroke="#f43f5e"
                  strokeWidth={0}
                  dot={{ r: 5, fill: '#f43f5e', stroke: '#881337', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};
