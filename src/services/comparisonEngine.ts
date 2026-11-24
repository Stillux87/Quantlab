/**
 * QuantLab - Backtest vs Paper Trading Comparison Engine (Step 15)
 * Analyzes live forward execution fidelity vs historical backtest expectations.
 */
import { PaperTradingSession, BacktestVsPaperComparison, Trade } from '../types';

export function compareBacktestVsPaper(session: PaperTradingSession): BacktestVsPaperComparison | null {
  if (!session.backtestReference) return null;

  const bt = session.backtestReference.metrics;
  const closedTrades = session.closedTrades;
  const liveCount = closedTrades.length;

  // Calculate live paper trading metrics
  const winningLive = closedTrades.filter((t) => t.pnlAmount > 0);
  const losingLive = closedTrades.filter((t) => t.pnlAmount <= 0);

  const liveWinRatePct = liveCount > 0 ? (winningLive.length / liveCount) * 100 : 0;
  const grossProfits = winningLive.reduce((sum, t) => sum + t.pnlAmount, 0);
  const grossLosses = Math.abs(losingLive.reduce((sum, t) => sum + t.pnlAmount, 0));
  const liveProfitFactor = grossLosses > 0 ? grossProfits / grossLosses : grossProfits > 0 ? 4.5 : 0;

  const totalLivePnl = session.currentCapital - session.initialCapital;
  const liveTotalReturnPct = (totalLivePnl / session.initialCapital) * 100;
  const avgTradeReturnPct = liveCount > 0 ? closedTrades.reduce((s, t) => s + t.pnlPercent, 0) / liveCount : 0;

  // Calculate live max drawdown from equity history
  let peak = session.initialCapital;
  let liveMaxDd = 0;
  for (const pt of session.equityHistory) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? ((peak - pt.equity) / peak) * 100 : 0;
    if (dd > liveMaxDd) liveMaxDd = dd;
  }

  const returnDelta = liveTotalReturnPct - bt.oosReturnPct;
  const winRateDelta = liveWinRatePct - bt.winRatePct;
  const profitFactorDelta = liveProfitFactor - bt.profitFactor;
  const drawdownDelta = liveMaxDd - bt.maxDrawdownPct;

  // Statistical significance threshold (needs at least 5-10 trades to be meaningful)
  const minTradesForSignificance = 6;
  const isStatisticallySignificant = liveCount >= minTradesForSignificance;

  // Replication Quality Score (0 - 100)
  let replicationScore = 85;
  if (liveCount > 0) {
    let penalty = 0;
    if (winRateDelta < -15) penalty += 20;
    else if (winRateDelta < -8) penalty += 10;

    if (profitFactorDelta < -0.5) penalty += 25;
    else if (profitFactorDelta < -0.2) penalty += 10;

    if (drawdownDelta > 8) penalty += 25;
    else if (drawdownDelta > 4) penalty += 12;

    if (liveTotalReturnPct < 0 && bt.oosReturnPct > 10) penalty += 25;

    replicationScore = Math.max(10, Math.min(100, 100 - penalty));
  }

  let verdict: BacktestVsPaperComparison['verdict'] = 'EXCELLENT_REPLICATION';
  let verdictText = '';

  if (!isStatisticallySignificant) {
    verdict = 'ACCEPTABLE_DECAY';
    verdictText = `Campione live in fase di accumulazione (${liveCount}/${minTradesForSignificance} trade). I dati finora registrati sono preliminari.`;
  } else if (replicationScore >= 80) {
    verdict = 'EXCELLENT_REPLICATION';
    verdictText = 'Alta fedeltà di esecuzione: le performance live confermano pienamente le metriche statistiche Out-Of-Sample del backtest.';
  } else if (replicationScore >= 60) {
    verdict = 'ACCEPTABLE_DECAY';
    verdictText = 'Lieve decadimento fisiologico (Alpha Decay) dovuto a spread, slippage o micro-variazioni di regime, ma profilo complessivamente conforme.';
  } else if (replicationScore >= 40) {
    verdict = 'SIGNIFICANT_DRIFT';
    verdictText = 'Scostamento significativo tra storico e tempo reale. Si consiglia di verificare se le condizioni di mercato attuali differiscono dal periodo di test.';
  } else {
    verdict = 'REGIME_FAILURE';
    verdictText = 'Divergenza critica: la strategia sta registrando perdite o drawdown anomali rispetto alla simulazione storica.';
  }

  return {
    sessionId: session.id,
    strategyName: session.strategyName,
    symbol: session.instrument.ticker,
    timeframe: session.timeframe,
    liveTradesCount: liveCount,
    minTradesForSignificance,
    isStatisticallySignificant,
    backtest: {
      totalReturnPct: bt.totalReturnPct,
      winRatePct: bt.winRatePct,
      profitFactor: bt.profitFactor,
      maxDrawdownPct: bt.maxDrawdownPct,
      avgTradeReturnPct: bt.avgWinPct - bt.avgLossPct,
    },
    paperTrading: {
      totalReturnPct: parseFloat(liveTotalReturnPct.toFixed(2)),
      winRatePct: parseFloat(liveWinRatePct.toFixed(1)),
      profitFactor: parseFloat(liveProfitFactor.toFixed(2)),
      maxDrawdownPct: parseFloat(liveMaxDd.toFixed(2)),
      avgTradeReturnPct: parseFloat(avgTradeReturnPct.toFixed(2)),
    },
    deltas: {
      returnDelta: parseFloat(returnDelta.toFixed(2)),
      winRateDelta: parseFloat(winRateDelta.toFixed(1)),
      profitFactorDelta: parseFloat(profitFactorDelta.toFixed(2)),
      drawdownDelta: parseFloat(drawdownDelta.toFixed(2)),
    },
    replicationScore,
    verdict,
    verdictText,
  };
}
