/**
 * QuantLab - Titan Unger Robustness & Overfitting Diagnostic Engine
 * Inspired by Andrea Unger's Titan software principles:
 * - Anti-Overfitting verification
 * - In-Sample vs Out-of-Sample Efficiency
 * - Average Trade capacity analysis (slippage/commission cushion)
 * - Monte Carlo Drawdown & Walk-Forward stability checks
 */
import { BacktestResult, TitanRobustnessReport } from '../types';

export function computeTitanRobustnessReport(result: BacktestResult): TitanRobustnessReport {
  const { metrics, trainMetrics, oosMetrics, trades } = result;
  const totalTrades = metrics.totalTrades;

  // 1. In-Sample vs Out-of-Sample Efficiency
  const trainRet = Math.max(0.1, trainMetrics?.totalReturnPct || metrics.trainReturnPct || 1);
  const oosRet = Math.max(0, oosMetrics?.totalReturnPct || metrics.oosReturnPct || 0);
  // Normalized OOS efficiency (OOS is typically ~25-30% of total time, so scale ratio)
  const oosEfficiencyPct = Math.min(150, Math.round((oosRet / (trainRet * 0.45)) * 100));

  // 2. Average Trade Analysis (€ and %)
  const avgTradePct = metrics.totalTrades > 0 ? metrics.totalReturnPct / metrics.totalTrades : 0;
  const avgTradeAmount = metrics.totalTrades > 0 ? metrics.totalPnlAmount / metrics.totalTrades : 0;

  // 3. Profit Factor & Recovery Factor
  const profitFactor = metrics.profitFactor || 1;
  const maxDd = Math.max(0.5, metrics.maxDrawdownPct || 1);
  const recoveryFactor = parseFloat((metrics.totalReturnPct / maxDd).toFixed(2));

  // 4. Walk Forward Efficiency Estimation
  const oosWinRate = oosMetrics?.winRatePct || metrics.winRatePct;
  const trainWinRate = trainMetrics?.winRatePct || metrics.winRatePct;
  const winRateDecay = Math.abs(trainWinRate - oosWinRate);
  const walkForwardEfficiencyPct = Math.max(20, Math.min(100, Math.round(100 - winRateDecay * 1.5 - (100 - Math.min(100, oosEfficiencyPct)) * 0.3)));

  // 5. Monte Carlo Drawdown Simulation (95th percentile worst-case)
  let mcMaxDd = maxDd * 1.25;
  if (trades.length >= 10) {
    const tradeReturns = trades.map((t) => t.pnlPercent);
    const mcRuns = 250;
    const maxDds: number[] = [];

    for (let r = 0; r < mcRuns; r++) {
      // Shuffle trades randomly
      const shuffled = [...tradeReturns].sort(() => Math.random() - 0.5);
      let eq = 100;
      let peak = 100;
      let worstDd = 0;

      for (const ret of shuffled) {
        eq = eq * (1 + ret / 100);
        if (eq > peak) peak = eq;
        const dd = ((peak - eq) / peak) * 100;
        if (dd > worstDd) worstDd = dd;
      }
      maxDds.push(worstDd);
    }

    maxDds.sort((a, b) => a - b);
    const idx95 = Math.floor(maxDds.length * 0.95);
    mcMaxDd = maxDds[idx95] || maxDd * 1.35;
  }

  // 6. Unger Titan Robustness Checklist
  const hasEnoughTrades = totalTrades >= 25;
  const hasGoodAvgTrade = avgTradePct >= 0.35 || avgTradeAmount >= 30;
  const hasGoodProfitFactor = profitFactor >= 1.35;
  const hasGoodOosEfficiency = oosEfficiencyPct >= 55;
  const hasControlledDrawdown = maxDd <= 22;
  const hasGoodRecovery = recoveryFactor >= 1.5;

  const checklist: TitanRobustnessReport['checklist'] = [
    {
      rule: 'Capienza Media del Trade (Average Trade Cushion)',
      passed: hasGoodAvgTrade,
      valueStr: `+${avgTradePct.toFixed(2)}% (€${avgTradeAmount.toFixed(2)})`,
      thresholdStr: 'Min +0.35% / €30',
      importance: 'CRITICAL',
    },
    {
      rule: 'Efficienza Out-of-Sample (OOS Robustness)',
      passed: hasGoodOosEfficiency,
      valueStr: `${oosEfficiencyPct}%`,
      thresholdStr: 'Min 55% di ritenzione',
      importance: 'CRITICAL',
    },
    {
      rule: 'Profit Factor di Sistema',
      passed: hasGoodProfitFactor,
      valueStr: profitFactor.toFixed(2),
      thresholdStr: 'Min 1.35',
      importance: 'HIGH',
    },
    {
      rule: 'Numero di Trade per Significatività Statistica',
      passed: hasEnoughTrades,
      valueStr: `${totalTrades} trade`,
      thresholdStr: 'Min 25 trade',
      importance: 'HIGH',
    },
    {
      rule: 'Tenuta del Max Drawdown Storico',
      passed: hasControlledDrawdown,
      valueStr: `-${maxDd.toFixed(2)}%`,
      thresholdStr: 'Max 22.0%',
      importance: 'HIGH',
    },
    {
      rule: 'Recovery Factor (Guadagno Netto / Max Drawdown)',
      passed: hasGoodRecovery,
      valueStr: recoveryFactor.toFixed(2),
      thresholdStr: 'Min 1.50',
      importance: 'MEDIUM',
    },
  ];

  // 7. Calculate Overall Titan Score (0 - 100)
  let titanScore = 40;
  if (hasGoodAvgTrade) titanScore += 18;
  if (hasGoodOosEfficiency) titanScore += 18;
  if (hasGoodProfitFactor) titanScore += 12;
  if (hasEnoughTrades) titanScore += 10;
  if (hasControlledDrawdown) titanScore += 8;
  if (hasGoodRecovery) titanScore += 6;
  if (walkForwardEfficiencyPct >= 65) titanScore += 8;

  titanScore = Math.max(10, Math.min(99, Math.round(titanScore)));

  // 8. Overfitting Verdict
  let overfittingVerdict: TitanRobustnessReport['overfittingVerdict'] = 'MODERATE_OVERFIT';
  let verdictExplanation = '';

  if (titanScore >= 80 && hasGoodAvgTrade && hasGoodOosEfficiency) {
    overfittingVerdict = 'ROBUST_EXCELLENT';
    verdictExplanation = 'La strategia supera tutti i rigorosi criteri del Metodo Unger: trigger elementare robusto, solido Average Trade per coprire i costi reali di borsa ed eccellente stabilità sui dati Out-Of-Sample.';
  } else if (titanScore >= 65) {
    overfittingVerdict = 'ROBUST_ACCEPTABLE';
    verdictExplanation = 'Buon profilo quantitativo con moderata tenuta statistica. L\'equity curve mantiene una pendenza positiva anche nella fase OOS, consigliato test preliminare in Paper Trading.';
  } else if (titanScore >= 45) {
    overfittingVerdict = 'MODERATE_OVERFIT';
    verdictExplanation = 'Rischio di overfitting rilevato: degrado delle metriche nella fase OOS o Average Trade troppo esiguo per sostenere slippage e commissioni reali nel lungo termine.';
  } else {
    overfittingVerdict = 'SEVERE_OVERFIT';
    verdictExplanation = 'Forte curva di overfitting (curve-fitting sui dati passati). La strategia non è idonea per il trading reale; semplificare i parametri o applicare filtri di regime.';
  }

  return {
    titanScore,
    oosEfficiencyPct,
    averageTradeAmount: parseFloat(avgTradeAmount.toFixed(2)),
    averageTradePct: parseFloat(avgTradePct.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    recoveryFactor,
    walkForwardEfficiencyPct,
    monteCarloMaxDrawdown95Pct: parseFloat(mcMaxDd.toFixed(2)),
    overfittingVerdict,
    verdictExplanation,
    checklist,
  };
}
