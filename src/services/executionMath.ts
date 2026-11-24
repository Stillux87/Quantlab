/**
 * QuantLab - Shared Deterministic Execution Math
 *
 * Single source of truth used by BOTH BacktestEngine and PaperTradingEngine so
 * simulated fills, slippage, spread, commissions, position sizing, stop-loss,
 * take-profit, and trailing-stop rules are 100% consistent and free of look-ahead bias.
 */
import { Bar, TradeDirection } from '../types';

export interface ExecutionCostConfig {
  commissionPct: number; // per side in %, e.g. 0.05 = 5 bps
  slippagePct: number;   // per side in %, e.g. 0.03 = 3 bps
  spreadPct: number;     // full bid-ask spread in %, e.g. 0.02 = 2 bps (half applied per side)
}

export interface ManagedPositionState {
  direction: TradeDirection;
  entryPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  highestPriceSinceEntry: number;
  lowestPriceSinceEntry: number;
}

export interface IntrabarExitEvaluation {
  exited: boolean;
  exitPrice: number;
  exitReason: 'STOP_LOSS' | 'TRAILING_STOP' | 'TAKE_PROFIT' | null;
  collisionNote?: string;
}

/**
 * Applies adverse execution friction (slippage + half spread) to a raw fill price.
 * BUY always pays a worse (higher) price; SELL always receives a worse (lower) price.
 */
export function applyExecutionFriction(
  rawPrice: number,
  side: 'BUY' | 'SELL',
  costs: Pick<ExecutionCostConfig, 'slippagePct' | 'spreadPct'>
): { fillPrice: number; frictionPerUnit: number } {
  const slip = Math.max(0, Number.isFinite(costs.slippagePct) ? costs.slippagePct : 0) / 100;
  const halfSpread = Math.max(0, Number.isFinite(costs.spreadPct) ? costs.spreadPct : 0) / 200;
  const totalFrictionRate = slip + halfSpread;
  const fillPrice =
    side === 'BUY' ? rawPrice * (1 + totalFrictionRate) : rawPrice * (1 - totalFrictionRate);
  return {
    fillPrice,
    frictionPerUnit: Math.abs(fillPrice - rawPrice),
  };
}

/**
 * Computes single-side trading commission on gross notional value.
 */
export function computeCommission(notionalValue: number, commissionPct: number): number {
  const rate = Math.max(0, Number.isFinite(commissionPct) ? commissionPct : 0) / 100;
  return Math.abs(notionalValue) * rate;
}

/**
 * Risk-based position sizing constrained by available capital and commission reserve.
 */
export function calculateRiskBasedQuantity(params: {
  availableCapital: number;
  entryPrice: number;
  stopLoss: number;
  riskPerTradePct: number;
  maxAllocationPct?: number;
  commissionPct?: number;
  fxRateToBase?: number;
}): number {
  const {
    availableCapital,
    entryPrice,
    stopLoss,
    riskPerTradePct,
    maxAllocationPct = 95,
    commissionPct = 0.05,
    fxRateToBase = 1.0,
  } = params;

  if (
    !Number.isFinite(availableCapital) ||
    availableCapital <= 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    !Number.isFinite(fxRateToBase) ||
    fxRateToBase <= 0
  ) {
    return 0;
  }

  const unitCostBase = entryPrice * fxRateToBase * (1 + Math.max(0, commissionPct) / 100);
  const maxNotionalBase = availableCapital * (Math.min(99, Math.max(1, maxAllocationPct)) / 100);
  const maxQty = maxNotionalBase / unitCostBase;

  const riskDistNative = Math.abs(entryPrice - stopLoss);
  if (!Number.isFinite(riskDistNative) || riskDistNative <= 0 || riskPerTradePct <= 0) {
    return Math.max(0, maxQty);
  }

  const riskBudgetBase = availableCapital * (riskPerTradePct / 100);
  const riskPerUnitBase = riskDistNative * fxRateToBase;
  const riskQty = riskBudgetBase / Math.max(1e-8, riskPerUnitBase);

  return Math.max(0, Math.min(riskQty, maxQty));
}

/**
 * Evaluates Stop Loss, Trailing Stop, and Take Profit strictly WITHOUT look-ahead bias:
 *
 * 1. Uses ONLY the active stop known BEFORE `bar` started (`pos.stopLoss` and prior `pos.trailingStop`).
 *    Never updates `trailingStop` from `bar.high`/`bar.low` before checking stops!
 * 2. Handles overnight/intrabar gaps realistically:
 *    - If LONG and `bar.open <= activeStop`, fills at `bar.open` (worse than stop) with adverse slippage.
 *    - If SHORT and `bar.open >= activeStop`, fills at `bar.open` with adverse slippage.
 * 3. Conservative Same-Bar Collision Rule (Documented):
 *    - When BOTH Stop Loss and Take Profit are touched within the same OHLC bar (without tick data),
 *      STOP LOSS / TRAILING STOP is ALWAYS assumed to trigger first to prevent optimistic bias.
 */
export function evaluateIntrabarExit(
  pos: ManagedPositionState,
  bar: Bar,
  costs: Pick<ExecutionCostConfig, 'slippagePct' | 'spreadPct'>
): IntrabarExitEvaluation {
  const isLong = pos.direction === 'LONG';
  const hasTrailing = typeof pos.trailingStop === 'number' && Number.isFinite(pos.trailingStop);

  const activeStop = hasTrailing
    ? isLong
      ? Math.max(pos.stopLoss, pos.trailingStop!)
      : Math.min(pos.stopLoss, pos.trailingStop!)
    : pos.stopLoss;

  const isTrailingActive = hasTrailing && activeStop === pos.trailingStop && activeStop !== pos.stopLoss;

  if (isLong) {
    const slHit = bar.low <= activeStop;
    const tpHit = bar.high >= pos.takeProfit;

    if (slHit) {
      // Gap-down open fills at bar.open, not at resting stop price
      const rawExit = bar.open <= activeStop ? bar.open : activeStop;
      const { fillPrice } = applyExecutionFriction(rawExit, 'SELL', costs);
      return {
        exited: true,
        exitPrice: fillPrice,
        exitReason: isTrailingActive ? 'TRAILING_STOP' : 'STOP_LOSS',
        collisionNote: tpHit
          ? 'SL e TP toccati nella stessa candela: applicata regola conservativa (SL eseguito prima).'
          : undefined,
      };
    }

    if (tpHit) {
      // Gap-up open above TP fills at bar.open (marketable limit), otherwise at TP
      const rawExit = bar.open >= pos.takeProfit ? bar.open : pos.takeProfit;
      const { fillPrice } = applyExecutionFriction(rawExit, 'SELL', costs);
      return {
        exited: true,
        exitPrice: fillPrice,
        exitReason: 'TAKE_PROFIT',
      };
    }
  } else {
    // SHORT position
    const slHit = bar.high >= activeStop;
    const tpHit = bar.low <= pos.takeProfit;

    if (slHit) {
      // Gap-up open fills at bar.open, not at resting stop price
      const rawExit = bar.open >= activeStop ? bar.open : activeStop;
      const { fillPrice } = applyExecutionFriction(rawExit, 'BUY', costs);
      return {
        exited: true,
        exitPrice: fillPrice,
        exitReason: isTrailingActive ? 'TRAILING_STOP' : 'STOP_LOSS',
        collisionNote: tpHit
          ? 'SL e TP toccati nella stessa candela: applicata regola conservativa (SL eseguito prima).'
          : undefined,
      };
    }

    if (tpHit) {
      const rawExit = bar.open <= pos.takeProfit ? bar.open : pos.takeProfit;
      const { fillPrice } = applyExecutionFriction(rawExit, 'BUY', costs);
      return {
        exited: true,
        exitPrice: fillPrice,
        exitReason: 'TAKE_PROFIT',
      };
    }
  }

  return { exited: false, exitPrice: 0, exitReason: null };
}

/**
 * Updates trailing stop & highest/lowest excursion strictly AFTER `evaluateIntrabarExit`
 * has completed for `bar`, so the updated stop takes effect starting on bar `i + 1` (zero look-ahead).
 */
export function updateTrailingStopAfterBar(
  pos: ManagedPositionState,
  bar: Bar,
  trailingStopPct?: number,
  options?: { enableBreakEvenAtPct?: number; breakEvenLockTrailPct?: number }
): void {
  if (bar.high > pos.highestPriceSinceEntry) {
    pos.highestPriceSinceEntry = bar.high;
  }
  if (bar.low < pos.lowestPriceSinceEntry) {
    pos.lowestPriceSinceEntry = bar.low;
  }

  const isLong = pos.direction === 'LONG';

  // Optional Break-Even profit lock (used consistently when enabled)
  if (options?.enableBreakEvenAtPct && options.enableBreakEvenAtPct > 0) {
    const peakGainPct = isLong
      ? ((pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice) * 100
      : ((pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice) * 100;

    if (peakGainPct >= options.enableBreakEvenAtPct) {
      const lockTrail = (options.breakEvenLockTrailPct ?? 0.6) / 100;
      if (isLong) {
        const beStop = pos.entryPrice * 1.0015;
        if (pos.stopLoss < beStop) pos.stopLoss = beStop;
        const locked = pos.highestPriceSinceEntry * (1 - lockTrail);
        if (pos.trailingStop === undefined || locked > pos.trailingStop) {
          pos.trailingStop = locked;
        }
      } else {
        const beStop = pos.entryPrice * 0.9985;
        if (pos.stopLoss > beStop) pos.stopLoss = beStop;
        const locked = pos.lowestPriceSinceEntry * (1 + lockTrail);
        if (pos.trailingStop === undefined || locked < pos.trailingStop) {
          pos.trailingStop = locked;
        }
      }
    }
  }

  // Standard percentage trailing stop
  if (trailingStopPct && Number.isFinite(trailingStopPct) && trailingStopPct > 0) {
    const trailFrac = trailingStopPct / 100;
    if (isLong) {
      const candidate = pos.highestPriceSinceEntry * (1 - trailFrac);
      if (pos.trailingStop === undefined || candidate > pos.trailingStop) {
        pos.trailingStop = candidate;
      }
    } else {
      const candidate = pos.lowestPriceSinceEntry * (1 + trailFrac);
      if (pos.trailingStop === undefined || candidate < pos.trailingStop) {
        pos.trailingStop = candidate;
      }
    }
  }
}
