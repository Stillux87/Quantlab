import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  DollarSign,
  Layers,
  XCircle,
  Activity,
} from 'lucide-react';
import { Position, Instrument, Bar, Timeframe } from '../types';

interface PositionChartWithLevelsProps {
  position: Position;
  instrument: Instrument;
  historicalBars?: Bar[];
  timeframe?: Timeframe;
  onClosePosition?: (posId: string, currentPrice: number) => void;
}

export const PositionChartWithLevels: React.FC<PositionChartWithLevelsProps> = ({
  position,
  instrument,
  historicalBars,
  timeframe = '1D',
  onClosePosition,
}) => {
  const sym = instrument.currencySymbol || '€';
  const isLong = position.direction === 'LONG';
  const isProfit = position.unrealizedPnlAmount >= 0;

  // Format exact opening time
  const formattedOpenTime = useMemo(() => {
    if (position.entryTimestamp && position.entryTimestamp > 0) {
      const d = new Date(position.entryTimestamp);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ore ${hours}:${minutes}:${seconds}`;
      }
    }
    return position.entryDateStr || 'N/D';
  }, [position.entryTimestamp, position.entryDateStr]);

  // Derive matching historical bars
  const bars = useMemo(() => {
    if (historicalBars && historicalBars.length > 5) {
      return historicalBars;
    }
    return [];
  }, [historicalBars]);

  // Prepare chart dataset focused around the open position
  const chartData = useMemo(() => {
    if (!bars || bars.length === 0) return [];
    
    // Take the last 35-45 bars leading into and including current price
    const recentBars = bars.slice(-40);

    return recentBars.map((b, idx) => {
      const isLastBar = idx === recentBars.length - 1;
      const effectiveClose = isLastBar ? position.currentPrice : b.close;
      
      const pnlAtPrice = isLong
        ? (effectiveClose - position.entryPrice) * position.quantity
        : (position.entryPrice - effectiveClose) * position.quantity;
      
      const pnlPctAtPrice = isLong
        ? ((effectiveClose - position.entryPrice) / position.entryPrice) * 100
        : ((position.entryPrice - effectiveClose) / position.entryPrice) * 100;

      return {
        timestamp: b.timestamp,
        dateStr: b.dateStr.includes(' ') ? b.dateStr.split(' ')[1] || b.dateStr : b.dateStr,
        fullDateStr: b.dateStr,
        open: b.open,
        high: isLastBar ? Math.max(b.high, position.currentPrice) : b.high,
        low: isLastBar ? Math.min(b.low, position.currentPrice) : b.low,
        close: effectiveClose,
        entryPrice: position.entryPrice,
        takeProfit: position.takeProfit,
        stopLoss: position.stopLoss,
        trailingStop: position.trailingStop || null,
        pnlAtPrice: parseFloat(pnlAtPrice.toFixed(2)),
        pnlPctAtPrice: parseFloat(pnlPctAtPrice.toFixed(2)),
        isCurrent: isLastBar,
      };
    });
  }, [bars, position, isLong]);

  // Calculate price boundaries for Y-Axis
  const yDomain = useMemo(() => {
    const prices = [
      position.entryPrice,
      position.stopLoss,
      position.takeProfit,
      position.currentPrice,
      ...(position.trailingStop ? [position.trailingStop] : []),
      ...chartData.map((d) => d.close),
    ].filter((p) => typeof p === 'number' && !isNaN(p) && p > 0);

    if (prices.length === 0) return ['auto', 'auto'];

    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const padding = (maxP - minP) * 0.08 || minP * 0.02;

    return [
      parseFloat((minP - padding).toFixed(2)),
      parseFloat((maxP + padding).toFixed(2)),
    ];
  }, [chartData, position]);

  // Distances to SL and TP
  const distanceToTpAmount = isLong
    ? (position.takeProfit - position.currentPrice) * position.quantity
    : (position.currentPrice - position.takeProfit) * position.quantity;

  const distanceToTpPct = isLong
    ? ((position.takeProfit - position.currentPrice) / position.currentPrice) * 100
    : ((position.currentPrice - position.takeProfit) / position.currentPrice) * 100;

  const distanceToSlAmount = isLong
    ? (position.currentPrice - position.stopLoss) * position.quantity
    : (position.stopLoss - position.currentPrice) * position.quantity;

  const distanceToSlPct = isLong
    ? ((position.currentPrice - position.stopLoss) / position.currentPrice) * 100
    : ((position.stopLoss - position.currentPrice) / position.currentPrice) * 100;

  const riskPerUnit = Math.abs(position.entryPrice - position.stopLoss);
  const rewardPerUnit = Math.abs(position.takeProfit - position.entryPrice);
  const riskRewardRatio = riskPerUnit > 0 ? (rewardPerUnit / riskPerUnit).toFixed(2) : '1.00';
  const totalPositionValue = position.quantity * position.currentPrice;

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 sm:p-6 space-y-5 shadow-xl">
      {/* Position Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                isLong
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}
            >
              {isLong ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              <span>{position.direction} {position.quantity} {instrument.ticker}</span>
            </span>

            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-mono text-xs border border-slate-700">
              {instrument.name}
            </span>

            <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 font-mono text-[11px] border border-cyan-800">
              {timeframe}
            </span>
          </div>

          {/* Opening Time Display */}
          <div className="flex items-center gap-2 text-xs text-slate-300 pt-1 flex-wrap">
            <div className="flex items-center gap-1 text-cyan-300 font-semibold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Orario di Apertura:</span>
              <strong className="text-white font-mono font-bold">{formattedOpenTime}</strong>
            </div>
            <span>&bull;</span>
            <span className="text-slate-400">
              Tempo in posizione: <strong className="text-slate-200 font-mono">{position.durationMinutes} min</strong>
            </span>
          </div>
        </div>

        {/* Live P&L and Quick Close Button */}
        <div className="flex items-center gap-3 self-start lg:self-auto">
          <div className="text-right bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">P&L Flottante</div>
            <div className={`text-lg font-black font-mono leading-tight ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? '+' : ''}{sym}{position.unrealizedPnlAmount.toFixed(2)}
              <span className="text-xs ml-1 font-semibold">
                ({isProfit ? '+' : ''}{position.unrealizedPnlPercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {onClosePosition && (
            <button
              onClick={() => onClosePosition(position.id, position.currentPrice)}
              className="px-3 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-900/30 transition-all cursor-pointer active:scale-95"
              title="Chiudi immediatamente questa posizione a mercato"
            >
              <XCircle className="w-4 h-4" />
              <span>Chiudi Posizione</span>
            </button>
          )}
        </div>
      </div>

      {/* Target Levels Summary Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Entry Price */}
        <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40">
          <div className="text-[11px] text-cyan-300 font-semibold flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Prezzo di Ingresso</span>
          </div>
          <div className="text-base font-black font-mono text-cyan-200 mt-0.5">
            {sym}{position.entryPrice.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Quote: {position.quantity} ({sym}{totalPositionValue.toFixed(2)})
          </div>
        </div>

        {/* Spot / Current Price */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-700/60">
          <div className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Prezzo Spot Live</span>
          </div>
          <div className="text-base font-black font-mono text-white mt-0.5">
            {sym}{position.currentPrice.toFixed(2)}
          </div>
          <div className={`text-[10px] font-mono font-semibold mt-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            Δ da ingresso: {isProfit ? '+' : ''}{(position.currentPrice - position.entryPrice).toFixed(2)} ({isProfit ? '+' : ''}{position.unrealizedPnlPercent.toFixed(2)}%)
          </div>
        </div>

        {/* Take Profit */}
        <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40">
          <div className="text-[11px] text-emerald-300 font-semibold flex items-center gap-1">
            <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Take Profit (Target)</span>
          </div>
          <div className="text-base font-black font-mono text-emerald-300 mt-0.5">
            {sym}{position.takeProfit.toFixed(2)}
          </div>
          <div className="text-[10px] text-emerald-400/90 font-mono mt-0.5 flex flex-wrap items-center justify-between gap-x-1">
            <span>Mancano: {distanceToTpPct >= 0 ? `${distanceToTpPct.toFixed(2)}%` : 'RAGGIUNTO'}</span>
            <span className="font-bold">(+{sym}{Math.max(0, distanceToTpAmount).toFixed(2)})</span>
          </div>
        </div>

        {/* Stop Loss */}
        <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800/40">
          <div className="text-[11px] text-rose-300 font-semibold flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>Stop Loss (Protezione)</span>
          </div>
          <div className="text-base font-black font-mono text-rose-300 mt-0.5">
            {sym}{position.stopLoss.toFixed(2)}
          </div>
          <div className="text-[10px] text-rose-400/90 font-mono mt-0.5 flex flex-wrap items-center justify-between gap-x-1">
            <span>Distanza: -{distanceToSlPct.toFixed(2)}%</span>
            <span className="font-bold">(-{sym}{distanceToSlAmount.toFixed(2)})</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Chart with Horizontal Level Lines */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1 gap-2 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap text-[11px]">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 sm:w-3 h-0.5 bg-emerald-400 rounded-full" />
              <strong className="text-emerald-400">Take Profit</strong>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 sm:w-3 h-0.5 bg-cyan-400 rounded-full" />
              <strong className="text-cyan-400">Ingresso</strong>
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-2.5 sm:w-3 h-0.5 bg-rose-500 rounded-full" />
              <strong className="text-rose-400">Stop Loss</strong>
            </span>
            {position.trailingStop && (
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 sm:w-3 h-0.5 bg-amber-400 rounded-full" />
                <strong className="text-amber-400">Trailing ({sym}{position.trailingStop.toFixed(2)})</strong>
              </span>
            )}
          </div>

          <div className="font-mono text-[11px] text-slate-400">
            Rapporto R:R: <strong className="text-emerald-400">1 : {riskRewardRatio}</strong>
          </div>
        </div>

        <div className="h-[260px] sm:h-[320px] w-full bg-slate-950/70 border border-slate-800 rounded-xl p-2 sm:p-2.5">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 5, bottom: 5 }}>
              <defs>
                <linearGradient id="priceAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isProfit ? '#10b981' : '#f43f5e'} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={isProfit ? '#10b981' : '#f43f5e'} stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

              <XAxis
                dataKey="dateStr"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                minTickGap={20}
              />

              <YAxis
                domain={yDomain}
                orientation="right"
                stroke="#64748b"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickFormatter={(v) => `${sym}${v.toFixed(1)}`}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[200px]">
                      <div className="font-bold text-white border-b border-slate-800 pb-1 flex justify-between">
                        <span>{d.fullDateStr}</span>
                        {d.isCurrent && <span className="text-emerald-400">● LIVE NOW</span>}
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Prezzo:</span>
                        <span className="font-mono font-bold text-white">{sym}{d.close.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-cyan-400">Ingresso:</span>
                        <span className="font-mono text-cyan-300">{sym}{d.entryPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-400">Take Profit:</span>
                        <span className="font-mono text-emerald-300">{sym}{d.takeProfit.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-rose-400">Stop Loss:</span>
                        <span className="font-mono text-rose-300">{sym}{d.stopLoss.toFixed(2)}</span>
                      </div>
                      <div className="border-t border-slate-800 pt-1 flex justify-between">
                        <span className="text-slate-400">P&L su Barra:</span>
                        <span className={`font-mono font-bold ${d.pnlAtPrice >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {d.pnlAtPrice >= 0 ? '+' : ''}{sym}{d.pnlAtPrice} ({d.pnlPctAtPrice >= 0 ? '+' : ''}{d.pnlPctAtPrice}%)
                        </span>
                      </div>
                    </div>
                  );
                }}
              />

              {/* Take Profit Reference Line */}
              <ReferenceLine
                y={position.takeProfit}
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `TAKE PROFIT: ${sym}${position.takeProfit.toFixed(2)}`,
                  position: 'insideTopRight',
                  fill: '#10b981',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              />

              {/* Entry Price Reference Line */}
              <ReferenceLine
                y={position.entryPrice}
                stroke="#38bdf8"
                strokeWidth={2}
                label={{
                  value: `INGRESSO (${position.direction}): ${sym}${position.entryPrice.toFixed(2)}`,
                  position: 'insideTopLeft',
                  fill: '#38bdf8',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              />

              {/* Stop Loss Reference Line */}
              <ReferenceLine
                y={position.stopLoss}
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: `STOP LOSS: ${sym}${position.stopLoss.toFixed(2)}`,
                  position: 'insideBottomRight',
                  fill: '#f43f5e',
                  fontSize: 11,
                  fontWeight: 'bold',
                }}
              />

              {/* Trailing Stop Reference Line (if active) */}
              {position.trailingStop && (
                <ReferenceLine
                  y={position.trailingStop}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="2 2"
                  label={{
                    value: `TRAILING SL: ${sym}${position.trailingStop.toFixed(2)}`,
                    position: 'insideBottomLeft',
                    fill: '#f59e0b',
                    fontSize: 10,
                  }}
                />
              )}

              {/* Price Area */}
              <Area
                type="monotone"
                dataKey="close"
                stroke={isProfit ? '#10b981' : '#f43f5e'}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#priceAreaFill)"
                dot={false}
                activeDot={{ r: 5, fill: '#38bdf8' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Trade Management Rationale & Details */}
      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            <strong>Motivo dell'Ingresso:</strong> {position.entryReason || 'Trigger breakout confermato con filtri di trend e volatilità'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 shrink-0 font-mono">
          <span>Minimo toccato: <strong className="text-rose-400">{sym}{position.lowestPriceSinceEntry?.toFixed(2) || position.entryPrice.toFixed(2)}</strong></span>
          <span>&bull;</span>
          <span>Massimo toccato: <strong className="text-emerald-400">{sym}{position.highestPriceSinceEntry?.toFixed(2) || position.entryPrice.toFixed(2)}</strong></span>
        </div>
      </div>
    </div>
  );
};
