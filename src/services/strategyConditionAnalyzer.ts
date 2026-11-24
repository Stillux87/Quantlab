/**
 * QuantLab - Strategy Entry Condition & Trigger Analyzer
 * Computes exact real-time trigger thresholds, filter statuses, distances,
 * and pedagogical explanations for what algorithmic strategies are waiting for.
 */
import { Bar, Instrument, UngerCoreTriggerType } from '../types';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
  calculateDonchianChannels,
  calculateSuperTrend,
  calculateMACD,
  calculateVWAP,
} from './indicators';

export interface StrategyConditionItem {
  id: string;
  name: string;
  category: 'TRIGGER' | 'TREND_FILTER' | 'VOLATILITY_FILTER' | 'TIME_FILTER' | 'PATTERN_FILTER' | 'RISK';
  description: string;
  status: 'SATISFIED' | 'WAITING' | 'BLOCKED';
  currentValueText: string;
  requiredValueText: string;
  distancePct?: number;
  distanceText?: string;
  explanation: string;
  importance: 'CRITICAL' | 'SECONDARY';
}

export interface StrategyTriggerAnalysis {
  strategyId: string;
  strategyName: string;
  instrument: Instrument;
  currentPrice: number;
  currencySymbol: string;
  overallStatus: 'READY_TO_ENTER' | 'WAITING_TRIGGER' | 'BLOCKED_BY_FILTER' | 'OUTSIDE_HOURS' | 'IN_POSITION';
  overallStatusTitle: string;
  overallStatusDescription: string;
  primaryWaitingReason: string;
  humanExplanation: string;

  // Specific trigger levels for charting
  triggerLevelLong?: number;
  triggerLevelShort?: number;
  trendFilterLevel?: number;
  plannedStopLoss?: number;
  plannedTakeProfit?: number;
  currentAtr?: number;

  // Distance to trigger
  distanceToLongTriggerPct?: number;
  distanceToLongTriggerEur?: number;

  // Checklist of conditions
  conditions: StrategyConditionItem[];

  // Recent chart data with trigger overlays
  chartBars: Array<{
    timestamp: number;
    dateStr: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    triggerLevel?: number;
    trendFilterLevel?: number;
    stopLossLevel?: number;
    takeProfitLevel?: number;
  }>;
}

/**
 * Calculates the exact price drop required for RSI to cross below the oversold threshold
 */
function findPriceForTargetRSI(closes: number[], period: number, targetRsi: number): number {
  if (!closes || closes.length < period) return (closes?.[closes.length - 1] || 100) * 0.95;
  const currentPrice = closes[closes.length - 1];
  let low = currentPrice * 0.40;
  let high = currentPrice * 1.05;
  const base = closes.slice(-Math.max(40, period * 2));
  for (let iter = 0; iter < 16; iter++) {
    const mid = (low + high) / 2;
    const testCloses = [...base, mid];
    const rsis = calculateRSI(testCloses, period);
    const rsi = rsis[rsis.length - 1] ?? 50;
    if (rsi < targetRsi) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return parseFloat(((low + high) / 2).toFixed(2));
}

/**
 * Calculates the exact price rise required for MACD line to cross above the signal line
 */
function findPriceForMacdCross(closes: number[], fast: number, slow: number, sig: number): number {
  if (!closes || closes.length < slow) return (closes?.[closes.length - 1] || 100) * 1.02;
  const currentPrice = closes[closes.length - 1];
  let low = currentPrice * 0.95;
  let high = currentPrice * 1.35;
  const base = closes.slice(-Math.max(100, slow * 3));
  for (let iter = 0; iter < 16; iter++) {
    const mid = (low + high) / 2;
    const testCloses = [...base, mid];
    const macdRes = calculateMACD(testCloses, fast, slow, sig);
    const m = macdRes.macd[macdRes.macd.length - 1] ?? 0;
    const s = macdRes.signal[macdRes.signal.length - 1] ?? 0;
    if (m >= s) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return parseFloat(((low + high) / 2).toFixed(2));
}

/**
 * Analyze any strategy's entry requirements on a given historical bar series
 */
export function analyzeStrategyWaitingConditions(
  instrument: Instrument,
  strategyId: string,
  strategyName: string,
  params: Record<string, any> = {},
  historicalBars: Bar[] = [],
  hasOpenPosition = false
): StrategyTriggerAnalysis {
  const bars = historicalBars && historicalBars.length > 0 ? historicalBars : [];

  const curr = instrument.currencySymbol || (instrument.currency === 'USD' ? '$' : instrument.currency === 'GBP' ? '£' : '€');

  const currentBar = bars[bars.length - 1] || {
    timestamp: Date.now(),
    dateStr: new Date().toISOString(),
    open: instrument.currentPrice,
    high: instrument.currentPrice * 1.01,
    low: instrument.currentPrice * 0.99,
    close: instrument.currentPrice,
    volume: 10000,
  };

  const currentPrice = currentBar.close || instrument.currentPrice;
  const closes = bars.map((b) => b.close);
  const totalBars = bars.length;

  const conditions: StrategyConditionItem[] = [];
  let triggerLevelLong: number | undefined;
  let triggerLevelShort: number | undefined;
  let trendFilterLevel: number | undefined;
  let plannedStopLoss: number | undefined;
  let plannedTakeProfit: number | undefined;
  let currentAtr: number | undefined;

  let overallStatus: StrategyTriggerAnalysis['overallStatus'] = 'WAITING_TRIGGER';
  let overallStatusTitle = 'In Attesa del Livello di Breakout';
  let overallStatusDescription = 'Tutti i filtri di sicurezza sono verificati. La strategia entrerà non appena il prezzo supererà il livello di trigger prestabilito.';
  let primaryWaitingReason = '';
  let humanExplanation = '';

  if (hasOpenPosition) {
    overallStatus = 'IN_POSITION';
    overallStatusTitle = 'Posizione Attualmente Aperta a Mercato';
    overallStatusDescription = 'La strategia ha già aperto una posizione sul titolo ed è in fase di gestione dinamica con Stop Loss e Take Profit.';
    primaryWaitingReason = 'Posizione a mercato in corso.';
    humanExplanation = `La strategia ${strategyName} è attualmente a mercato su ${instrument.ticker}. Sta monitorando l'escursione dei prezzi per applicare trailing stop o chiusura al raggiungimento del target.`;
  }

  // Precalculate ATR
  const atrPeriod = Number(params.atrPeriod) || 14;
  const atrSeries = calculateATR(bars, atrPeriod);
  currentAtr = atrSeries[atrSeries.length - 1] || Math.max(0.01, currentBar.high - currentBar.low);

  // Determine Stop Loss and Take Profit levels
  const isAtrStop = params.stopLossType !== 'MONETARY_PCT';
  const slVal = Number(params.stopLossValue) || 2.0;
  const stopDist = isAtrStop ? currentAtr * slVal : currentPrice * (slVal / 100);
  plannedStopLoss = Math.max(0.01, currentPrice - stopDist);

  const isAtrTp = params.takeProfitType !== 'MONETARY_PCT';
  const tpVal = Number(params.takeProfitValue) || 3.5;
  const tpDist = isAtrTp ? currentAtr * tpVal : currentPrice * (tpVal / 100);
  plannedTakeProfit = currentPrice + tpDist;

  // Normalize Strategy Identification
  const isUngerFamily =
    strategyId === 'unger_titan_strategy' ||
    strategyId === 'unger_titan' ||
    strategyId === 'donchian_turtle' ||
    strategyId.includes('unger') ||
    strategyId.includes('titan');

  if (isUngerFamily) {
    const triggerType: UngerCoreTriggerType = (params.triggerType as UngerCoreTriggerType) || 'DONCHIAN_BREAKOUT';

    // A. Trend Filter Check (SMA 200)
    const trendPeriod = Number(params.trendFilterPeriod) || 200;
    const trendEnabled = params.trendFilterEnabled !== false;
    let passesTrend = true;

    if (trendEnabled && totalBars >= 20) {
      const smaPeriod = Math.min(trendPeriod, totalBars);
      const sma = calculateSMA(closes, smaPeriod);
      trendFilterLevel = sma[sma.length - 1];

      if (trendFilterLevel !== undefined) {
        const mode = params.trendFilterMode || 'ABOVE_SMA';
        if (mode === 'ABOVE_SMA') {
          passesTrend = currentPrice >= trendFilterLevel;
          const diffPct = (((currentPrice - trendFilterLevel) / trendFilterLevel) * 100).toFixed(2);
          conditions.push({
            id: 'trend_sma',
            name: `Filtro di Trend (SMA ${smaPeriod})`,
            category: 'TREND_FILTER',
            description: `Il prezzo deve trovarsi sopra la media mobile a ${smaPeriod} periodi per garantire di tradare solo a favore del trend primario.`,
            status: passesTrend ? 'SATISFIED' : 'BLOCKED',
            currentValueText: `${curr}${currentPrice.toFixed(2)}`,
            requiredValueText: `> ${curr}${trendFilterLevel.toFixed(2)} (${diffPct}%)`,
            explanation: passesTrend
              ? `Regime rialzista confermato: il prezzo si trova ${diffPct}% sopra la SMA ${smaPeriod}.`
              : `Regime ribassista: il prezzo si trova ${Math.abs(Number(diffPct))}% sotto la SMA ${smaPeriod}. La strategia blocca gli acquisti per evitare falsi segnali in downtrend.`,
            importance: 'CRITICAL',
          });
        }
      }
    } else {
      conditions.push({
        id: 'trend_sma',
        name: 'Filtro di Trend SMA',
        category: 'TREND_FILTER',
        description: 'Filtro di trend disattivato o non richiesto dalla configurazione.',
        status: 'SATISFIED',
        currentValueText: 'Disattivato',
        requiredValueText: 'Nessun vincolo',
        explanation: 'Gli ordini sono abilitati indipendentemente dal trend di fondo.',
        importance: 'SECONDARY',
      });
    }

    // B. Volatility Filter Check (ATR vs SMA ATR)
    const volEnabled = params.volatilityFilterEnabled !== false;
    let passesVolatility = true;

    if (volEnabled && totalBars >= 20) {
      const atrSmaPeriod = Number(params.atrSmaPeriod) || 50;
      const validAtrs = atrSeries.filter((v): v is number => v !== undefined);
      const effectivePeriod = Math.min(atrSmaPeriod, validAtrs.length);
      const atrSma = calculateSMA(validAtrs, effectivePeriod);
      const currentAtrSma = atrSma[atrSma.length - 1] || currentAtr;

      const mode = params.volatilityFilterMode || 'EXPANSION';
      if (mode === 'EXPANSION') {
        passesVolatility = currentAtr >= currentAtrSma * 0.95;
        const atrRatio = ((currentAtr / (currentAtrSma || 1)) * 100).toFixed(0);
        conditions.push({
          id: 'volatility_atr',
          name: `Filtro Volatilità (ATR ${atrPeriod} vs Media)`,
          category: 'VOLATILITY_FILTER',
          description: 'Richiede che la volatilità sia in fase di espansione per favorire movimenti direzionali esplosivi.',
          status: passesVolatility ? 'SATISFIED' : 'WAITING',
          currentValueText: `${curr}${currentAtr.toFixed(3)} (${atrRatio}% della media)`,
          requiredValueText: `≥ ${curr}${currentAtrSma.toFixed(3)} (Media ${effectivePeriod}p)`,
          explanation: passesVolatility
            ? `Volatilità sufficiente per breakout direzionale (ATR ${curr}${currentAtr.toFixed(3)}).`
            : `Mercato in fase di compressione/bassa volatilità. La strategia attende che i volumi e l'escursione aumentino prima di entrare.`,
          importance: 'SECONDARY',
        });
      }
    }

    // C. Time & Session Window Check
    const timeEnabled = !!params.timeWindowFilterEnabled;
    let passesTime = true;
    if (timeEnabled) {
      const d = new Date(currentBar.timestamp);
      const barTotal = d.getHours() * 60 + d.getMinutes();
      const startTotal = (Number(params.sessionStartHour) || 9) * 60 + (Number(params.sessionStartMinute) || 0);
      const endTotal = (Number(params.sessionEndHour) || 17) * 60 + (Number(params.sessionEndMinute) || 30);
      passesTime = barTotal >= startTotal && barTotal <= endTotal;

      conditions.push({
        id: 'session_time',
        name: 'Finestra Oraria Operativa',
        category: 'TIME_FILTER',
        description: `Ingressi autorizzati solo tra le ${params.sessionStartHour || 9}:00 e le ${params.sessionEndHour || 17}:30.`,
        status: passesTime ? 'SATISFIED' : 'BLOCKED',
        currentValueText: `${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`,
        requiredValueText: `${params.sessionStartHour || 9}:00 - ${params.sessionEndHour || 17}:30`,
        explanation: passesTime
          ? 'Sessione di borsa attiva e all\'interno della finestra temporale consentita.'
          : 'Fuori dagli orari ottimali di mercato. La strategia evita gli orari a bassa liquidità.',
        importance: 'SECONDARY',
      });
    }

    // D. Core Trigger Breakdown
    if (triggerType === 'DONCHIAN_BREAKOUT' || strategyId === 'donchian_turtle') {
      const period = Number(params.donchianPeriod) || 20;
      const donchian = calculateDonchianChannels(bars, Math.min(period, totalBars));
      const upper = donchian.upper[donchian.upper.length - 1] ?? Math.max(...bars.slice(-period).map((b) => b.high));
      const lower = donchian.lower[donchian.lower.length - 1] ?? Math.min(...bars.slice(-period).map((b) => b.low));

      triggerLevelLong = upper;
      triggerLevelShort = lower;

      const distLongEur = Math.max(0, upper - currentPrice);
      const distLongPct = upper > currentPrice ? ((upper - currentPrice) / currentPrice) * 100 : 0;
      const isBreakout = currentPrice >= upper;

      conditions.unshift({
        id: 'donchian_trigger',
        name: `Trigger Breakout Donchian (${period} Periodi)`,
        category: 'TRIGGER',
        description: `Il prezzo deve rompere al rialzo il massimo delle ultime ${period} candele (${curr}${upper.toFixed(2)}).`,
        status: isBreakout ? 'SATISFIED' : 'WAITING',
        currentValueText: `${curr}${currentPrice.toFixed(2)}`,
        requiredValueText: `≥ ${curr}${upper.toFixed(2)} (${distLongPct > 0 ? '+' + distLongPct.toFixed(2) + '%' : 'Soddisfatto'})`,
        distancePct: parseFloat(distLongPct.toFixed(2)),
        distanceText: distLongPct > 0 ? `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)` : 'Livello Raggiunto!',
        explanation: isBreakout
          ? `Breakout confermato! Il prezzo ha superato il massimo a ${period} periodi (${curr}${upper.toFixed(2)}).`
          : `Il titolo è in fase di consolidamento all'interno del canale (${curr}${lower.toFixed(2)} - ${curr}${upper.toFixed(2)}). Manca un rialzo del +${distLongPct.toFixed(2)}% per attivare l'ordine d'acquisto.`,
        importance: 'CRITICAL',
      });

      if (!hasOpenPosition) {
        if (!passesTrend) {
          overallStatus = 'BLOCKED_BY_FILTER';
          overallStatusTitle = 'In Attesa del Filtro di Trend SMA';
          overallStatusDescription = `Il titolo è attualmente sotto la SMA di lungo periodo (${curr}${trendFilterLevel?.toFixed(2)}). La strategia non acquista in regime ribassista per proteggere il capitale.`;
          primaryWaitingReason = `Prezzo sotto la SMA di Trend (${curr}${currentPrice.toFixed(2)} < ${curr}${trendFilterLevel?.toFixed(2)}).`;
          humanExplanation = `La strategia Unger su ${instrument.ticker} è in attesa perché il titolo si trova al di sotto della media mobile di lungo periodo (${curr}${trendFilterLevel?.toFixed(2)}). Il Metodo Unger impone di non aprire posizioni rialziste quando il mercato è in downtrend, azzerando le perdite da falsi rimbalzi.`;
        } else if (!passesVolatility) {
          overallStatus = 'BLOCKED_BY_FILTER';
          overallStatusTitle = 'In Attesa di Espansione di Volatilità';
          overallStatusDescription = 'La volatilità attuale è inferiore alla soglia minima. Si attende una fase più dinamica prima di intervenire.';
          primaryWaitingReason = 'Volatilità compressa (ATR sotto media).';
          humanExplanation = `La strategia è in standby perché la volatilità su ${instrument.ticker} è momentaneamente troppo bassa. Aprire un trade in bassa volatilità comporterebbe restare bloccati in range stretti con commissioni inutili.`;
        } else if (distLongPct > 0) {
          overallStatus = 'WAITING_TRIGGER';
          overallStatusTitle = `In Attesa del Breakout a ${curr}${upper.toFixed(2)}`;
          overallStatusDescription = `Tutti i filtri di regime sono VERIFICATI ✅. La strategia attende un rialzo del +${distLongPct.toFixed(2)}% (${curr}${upper.toFixed(2)}) per aprire la posizione.`;
          primaryWaitingReason = `Prezzo a ${curr}${currentPrice.toFixed(2)}, trigger d'ingresso fissato a ${curr}${upper.toFixed(2)} (+${distLongPct.toFixed(2)}%).`;
          humanExplanation = `Tutti i filtri quantitativi su ${instrument.ticker} sono positivi. Il sistema non è entrato nella giornata appena trascorsa perché il prezzo è rimasto all'interno del suo intervallo di oscillazione senza rompere la resistenza chiave a ${curr}${upper.toFixed(2)}. Non appena la pressione rialzista spingerà il titolo oltre ${curr}${upper.toFixed(2)}, l'ordine verrà eseguito automaticamente all'apertura della candela successiva.`;
        } else {
          overallStatus = 'READY_TO_ENTER';
          overallStatusTitle = 'Condizioni Soddisfatte - Pronto all\'Ingresso';
          overallStatusDescription = 'Tutte le condizioni e i filtri sono soddisfatti al 100%. L\'ordine verrà generato al prossimo tick di mercato.';
          primaryWaitingReason = 'Breakout verificato e filtri validi.';
          humanExplanation = `Tutte le condizioni di ingresso per ${instrument.ticker} sono soddisfatte. La strategia aprirà la posizione al prossimo prezzo disponibile.`;
        }
      }
    } else if (triggerType === 'PRIOR_DAY_BREAKOUT') {
      // Prior day breakout
      let prevDayHigh = currentBar.high;
      let prevDayLow = currentBar.low;
      const currentDayStr = currentBar.dateStr.substring(0, 10);

      for (let i = bars.length - 2; i >= 0; i--) {
        const b = bars[i];
        const bDayStr = b.dateStr.substring(0, 10);
        if (bDayStr !== currentDayStr) {
          prevDayHigh = b.high;
          prevDayLow = b.low;
          break;
        }
      }

      triggerLevelLong = prevDayHigh;
      triggerLevelShort = prevDayLow;
      const distEur = Math.max(0, prevDayHigh - currentPrice);
      const distPct = prevDayHigh > currentPrice ? ((prevDayHigh - currentPrice) / currentPrice) * 100 : 0;
      const isBreakout = currentPrice > prevDayHigh;

      conditions.unshift({
        id: 'prior_day_trigger',
        name: 'Breakout Massimo Giornata Precedente',
        category: 'TRIGGER',
        description: `Il prezzo deve superare il massimo registrato nella sessione precedente (${curr}${prevDayHigh.toFixed(2)}).`,
        status: isBreakout ? 'SATISFIED' : 'WAITING',
        currentValueText: `${curr}${currentPrice.toFixed(2)}`,
        requiredValueText: `> ${curr}${prevDayHigh.toFixed(2)} (${distPct > 0 ? '+' + distPct.toFixed(2) + '%' : 'Soddisfatto'})`,
        distancePct: parseFloat(distPct.toFixed(2)),
        distanceText: distPct > 0 ? `Mancano +${curr}${distEur.toFixed(2)} (+${distPct.toFixed(2)}%)` : 'Superato',
        explanation: isBreakout
          ? `Massimo precedente rotto con successo a quota ${curr}${prevDayHigh.toFixed(2)}.`
          : `Il titolo quota a ${curr}${currentPrice.toFixed(2)}. Manca un rialzo di +${distPct.toFixed(2)}% per rompere il massimo della seduta precedente (${curr}${prevDayHigh.toFixed(2)}).`,
        importance: 'CRITICAL',
      });

      if (!hasOpenPosition) {
        overallStatus = isBreakout ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
        overallStatusTitle = isBreakout ? 'Breakout Sessione Precedente Confermato' : `In Attesa di Rottura a ${curr}${prevDayHigh.toFixed(2)}`;
        overallStatusDescription = `La strategia attende il breakout del massimo del giorno precedente a ${curr}${prevDayHigh.toFixed(2)}.`;
        primaryWaitingReason = `Prezzo a ${curr}${currentPrice.toFixed(2)}, massimo precedente a ${curr}${prevDayHigh.toFixed(2)}.`;
        humanExplanation = `La strategia intraday attende che il prezzo superi il massimo del giorno precedente (${curr}${prevDayHigh.toFixed(2)}) per confermare la ripresa dell'impulso. Durante l'ultima seduta il mercato non ha superato questo livello, mantenendo la posizione chiusa.`;
      }
    } else if (triggerType === 'BOLLINGER_REVERSAL') {
      const bbPeriod = Number(params.bbPeriod) || 20;
      const bbStd = Number(params.bbStdDev) || 2.0;
      const bb = calculateBollingerBands(closes, Math.min(bbPeriod, totalBars), bbStd);
      const upper = bb.upper[bb.upper.length - 1] || currentPrice * 1.03;
      const lower = bb.lower[bb.lower.length - 1] || currentPrice * 0.97;
      const middle = bb.middle[bb.middle.length - 1] || currentPrice;

      triggerLevelLong = lower;
      triggerLevelShort = upper;
      const distLowerPct = (((currentPrice - lower) / currentPrice) * 100);

      conditions.unshift({
        id: 'bb_trigger',
        name: `Banda Inferiore Bollinger (${bbPeriod}, ${bbStd}σ)`,
        category: 'TRIGGER',
        description: `Attende che il prezzo tocchi o scenda sotto la banda inferiore (${curr}${lower.toFixed(2)}) per cogliere un eccesso statistico di ipervenduto.`,
        status: currentPrice <= lower ? 'SATISFIED' : 'WAITING',
        currentValueText: `${curr}${currentPrice.toFixed(2)}`,
        requiredValueText: `≤ ${curr}${lower.toFixed(2)} (-${distLowerPct.toFixed(2)}%)`,
        distancePct: parseFloat(distLowerPct.toFixed(2)),
        distanceText: `Distanza dal supporto di ipervenduto: ${distLowerPct.toFixed(2)}%`,
        explanation: currentPrice <= lower
          ? 'Prezzo sull\'estremo inferiore delle Bande: eccesso statistico pronto per il rimbalzo.'
          : `Il prezzo è all'interno delle bande (${curr}${lower.toFixed(2)} - ${curr}${upper.toFixed(2)}). Nessun eccesso di prezzo rilevato oggi.`,
        importance: 'CRITICAL',
      });

      if (!hasOpenPosition) {
        overallStatus = 'WAITING_TRIGGER';
        overallStatusTitle = 'In Attesa di Eccesso di Ipervenduto';
        overallStatusDescription = `La strategia Mean Reversion attende che il titolo scenda verso la banda inferiore (${curr}${lower.toFixed(2)}) prima di comprare sul pullback.`;
        primaryWaitingReason = `Prezzo al centro del canale (${curr}${currentPrice.toFixed(2)}). Livello di acquisto su ipervenduto a ${curr}${lower.toFixed(2)}.`;
        humanExplanation = `La strategia cerca un'opportunità di acquisto a sconto: durante la giornata il titolo è oscillato vicino alla media (${curr}${middle.toFixed(2)}) senza toccare i livelli estremi di prezzo (${curr}${lower.toFixed(2)}). La liquidità resta al sicuro al 100%.`;
      }
    } else {
      // Default Generic Unger Trigger
      triggerLevelLong = currentPrice * 1.02;
      conditions.unshift({
        id: 'generic_trigger',
        name: `Trigger Direzionale ${triggerType}`,
        category: 'TRIGGER',
        description: 'Verifica le condizioni del setup statistico d\'ingresso.',
        status: 'WAITING',
        currentValueText: `${curr}${currentPrice.toFixed(2)}`,
        requiredValueText: `Setup attivo a ${curr}${triggerLevelLong.toFixed(2)}`,
        explanation: `La strategia monitora il flusso ordini su ${instrument.ticker}.`,
        importance: 'CRITICAL',
      });
      overallStatus = 'WAITING_TRIGGER';
      overallStatusTitle = 'In Attesa del Setup Direzionale';
      overallStatusDescription = 'La strategia è attiva e monitora i parametri di volatilità e breakout.';
      primaryWaitingReason = 'Nessun setup statistico verificato nella giornata.';
      humanExplanation = `Durante la giornata di borsa il titolo ${instrument.ticker} non ha generato una deviazione statistica sufficiente ad attivare l'ingresso sistematico.`;
    }
  }
  // 2. EMA TREND FOLLOWING (Crossover + Trend Filter)
  else if (strategyId === 'ema_trend' || strategyId === 'ema_crossover') {
    const fastP = Number(params.fastEmaPeriod || params.fastPeriod) || 12;
    const slowP = Number(params.slowEmaPeriod || params.slowPeriod) || 26;
    const trendP = Number(params.trendFilterPeriod || params.trendFilterEma) || 200;
    const useFilter = params.useTrendFilter !== false;

    const fastEma = calculateEMA(closes, Math.min(fastP, totalBars));
    const slowEma = calculateEMA(closes, Math.min(slowP, totalBars));
    const trendSma = useFilter && totalBars >= 20 ? calculateSMA(closes, Math.min(trendP, totalBars)) : [];

    const currentFast = fastEma[fastEma.length - 1] || currentPrice;
    const prevFast = fastEma[fastEma.length - 2] || currentFast;
    const currentSlow = slowEma[slowEma.length - 1] || currentPrice;
    const prevSlow = slowEma[slowEma.length - 2] || currentSlow;
    const currentTrend = trendSma.length > 0 ? trendSma[trendSma.length - 1] : undefined;

    trendFilterLevel = currentTrend;

    // Closed-form calculation for price needed to trigger EMA Golden Cross on next bar
    const kFast = 2 / (fastP + 1);
    const kSlow = 2 / (slowP + 1);
    let crossPrice = currentPrice;
    if (kFast > kSlow) {
      crossPrice = Math.max(0.01, (prevSlow * (1 - kSlow) - prevFast * (1 - kFast)) / (kFast - kSlow));
    }
    triggerLevelLong = currentTrend ? Math.max(crossPrice, currentTrend) : crossPrice;
    triggerLevelShort = currentTrend ? Math.min(crossPrice, currentTrend) : crossPrice;

    const isCrossBullish = currentFast > currentSlow;
    const passesTrend = !useFilter || currentTrend === undefined || currentPrice >= currentTrend;
    const isReady = isCrossBullish && passesTrend;

    const distLongEur = Math.max(0, triggerLevelLong - currentPrice);
    const distLongPct = triggerLevelLong > currentPrice ? ((triggerLevelLong - currentPrice) / currentPrice) * 100 : 0;

    conditions.push({
      id: 'ema_cross',
      name: `Incrocio EMA (${fastP} vs ${slowP})`,
      category: 'TRIGGER',
      description: `La media veloce a ${fastP} periodi deve incrociare verso l'alto la media lenta a ${slowP} periodi (Prezzo trigger calcolato: ${curr}${crossPrice.toFixed(2)}).`,
      status: isCrossBullish ? 'SATISFIED' : 'WAITING',
      currentValueText: `Fast: ${curr}${currentFast.toFixed(2)} | Slow: ${curr}${currentSlow.toFixed(2)}`,
      requiredValueText: `EMA ${fastP} > EMA ${slowP} (Target: ${curr}${crossPrice.toFixed(2)})`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: distLongPct > 0 ? `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)` : 'Incrocio Confermato',
      explanation: isCrossBullish
        ? 'EMA Veloce stabilmente sopra la Lenta: trend positivo e momentum attivo.'
        : `EMA Veloce (${curr}${currentFast.toFixed(2)}) sotto la Lenta (${curr}${currentSlow.toFixed(2)}). Manca un'accelerazione fino a quota ${curr}${crossPrice.toFixed(2)} per invertire il momentum.`,
      importance: 'CRITICAL',
    });

    if (useFilter && currentTrend !== undefined) {
      conditions.push({
        id: 'ema_trend_filter',
        name: `Filtro Regime SMA ${trendP}`,
        category: 'TREND_FILTER',
        description: `Prezzo deve essere sopra la media ${trendP} per autorizzare acquisti a favore di trend.`,
        status: passesTrend ? 'SATISFIED' : 'BLOCKED',
        currentValueText: `${curr}${currentPrice.toFixed(2)}`,
        requiredValueText: `> ${curr}${currentTrend.toFixed(2)}`,
        explanation: passesTrend
          ? `Prezzo sopra la SMA ${trendP} (+${(((currentPrice - currentTrend) / currentTrend) * 100).toFixed(1)}%). Filtro verde.`
          : `Prezzo sotto la SMA ${trendP} (${curr}${currentPrice.toFixed(2)} < ${curr}${currentTrend.toFixed(2)}). Gli ingressi sono bloccati per evitare trappole in downtrend.`,
        importance: 'CRITICAL',
      });
    }

    if (!hasOpenPosition) {
      if (!passesTrend) {
        overallStatus = 'BLOCKED_BY_FILTER';
        overallStatusTitle = 'Bloccato dal Filtro di Trend SMA';
        overallStatusDescription = `Il prezzo (${curr}${currentPrice.toFixed(2)}) è sotto la SMA ${trendP} (${curr}${currentTrend?.toFixed(2)}). Nessun acquisto in regime ribassista.`;
        primaryWaitingReason = `Prezzo sotto la media mobile di lungo periodo (${curr}${currentTrend?.toFixed(2)}).`;
        humanExplanation = `Secondo la metodologia sistematica Unger, entrare al rialzo sotto la media di lungo termine espone a pesanti drawdown. Il sistema preserva la liquidità fino a quando il titolo non recupera ${curr}${currentTrend?.toFixed(2)}.`;
      } else if (distLongPct > 0) {
        overallStatus = 'WAITING_TRIGGER';
        overallStatusTitle = `In Attesa del Cross Rialzista a ${curr}${triggerLevelLong.toFixed(2)}`;
        overallStatusDescription = `La media veloce è al di sotto della lenta. Si attende un rialzo del +${distLongPct.toFixed(2)}% (${curr}${triggerLevelLong.toFixed(2)}) per il segnale di acquisto.`;
        primaryWaitingReason = `Prezzo attuale a ${curr}${currentPrice.toFixed(2)}, trigger a ${curr}${triggerLevelLong.toFixed(2)} (+${distLongPct.toFixed(2)}%).`;
        humanExplanation = `La strategia EMA Trend su ${instrument.ticker} attende un'accelerazione per formare il Golden Cross delle medie mobili. Il capitale resta in liquidità senza incorrere in falsi segnali laterali.`;
      } else {
        overallStatus = 'READY_TO_ENTER';
        overallStatusTitle = 'Incrocio EMA Rialzista Attivo';
        overallStatusDescription = 'Tutte le condizioni e i filtri sono verificati. Pronto all\'ingresso al prossimo tick.';
        primaryWaitingReason = 'Incrocio rialzista completato e confermato.';
        humanExplanation = `Tutti i filtri e l'incrocio di medie su ${instrument.ticker} sono positivi. L'ordine verrà aperto al prossimo prezzo utile.`;
      }
    }
  }
  // 3. RSI MEAN REVERSION
  else if (strategyId === 'rsi_mean_reversion') {
    const period = Number(params.rsiPeriod || params.period) || 14;
    const oversold = Number(params.oversoldThreshold || params.oversold) || 30;
    const overbought = Number(params.overboughtThreshold || params.overbought) || 70;
    const rsiVals = calculateRSI(closes, Math.min(period, totalBars));
    const currentRsi = rsiVals[rsiVals.length - 1] || 50;

    const isOversold = currentRsi <= oversold;
    const distRsi = currentRsi - oversold;

    // Compute exact mathematical price drop required to reach RSI oversold target
    const targetOversoldPrice = isOversold
      ? currentPrice
      : findPriceForTargetRSI(closes, period, oversold);

    triggerLevelLong = targetOversoldPrice;
    triggerLevelShort = findPriceForTargetRSI(closes, period, overbought);

    const distLongEur = Math.max(0, currentPrice - targetOversoldPrice);
    const distLongPct = currentPrice > targetOversoldPrice
      ? ((currentPrice - targetOversoldPrice) / currentPrice) * 100
      : 0;

    conditions.push({
      id: 'rsi_level',
      name: `RSI a ${period} Periodi`,
      category: 'TRIGGER',
      description: `L'oscillatore RSI deve scendere sotto quota ${oversold} (prezzo obiettivo di ipervenduto: ${curr}${targetOversoldPrice.toFixed(2)}).`,
      status: isOversold ? 'SATISFIED' : 'WAITING',
      currentValueText: `RSI = ${currentRsi.toFixed(1)} (${curr}${currentPrice.toFixed(2)})`,
      requiredValueText: `RSI ≤ ${oversold} (Livello: ${curr}${targetOversoldPrice.toFixed(2)})`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: isOversold
        ? 'Ipervenduto Raggiunto!'
        : `Distanza: -${distRsi.toFixed(1)} punti RSI (-${curr}${distLongEur.toFixed(2)} / -${distLongPct.toFixed(2)}%)`,
      explanation: isOversold
        ? `RSI in ipervenduto estremo a ${currentRsi.toFixed(1)}: rimbalzo statistico imminente.`
        : `RSI a quota neutra (${currentRsi.toFixed(1)}). Il mercato è in equilibrio senza eccessi di vendita: la strategia compra solo in caso di svendita statistica a ${curr}${targetOversoldPrice.toFixed(2)}.`,
      importance: 'CRITICAL',
    });

    if (!hasOpenPosition) {
      overallStatus = isOversold ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isOversold ? 'Ipervenduto Confermato - Pronto' : `In Attesa di Ipervenduto (RSI ${currentRsi.toFixed(1)} > ${oversold})`;
      overallStatusDescription = isOversold
        ? 'RSI sotto la soglia critica: setup di Mean Reversion attivo.'
        : `La strategia attende un calo a quota ${curr}${targetOversoldPrice.toFixed(2)} (-${distLongPct.toFixed(2)}%) per comprare a forte sconto.`;
      primaryWaitingReason = isOversold
        ? 'Pronto all\'ingresso.'
        : `RSI neutrale (${currentRsi.toFixed(1)}). Il prezzo deve scendere a ${curr}${targetOversoldPrice.toFixed(2)} per toccare l'ipervenduto.`;
      humanExplanation = `La strategia RSI Mean Reversion opera solo su deviazioni estreme: non compra sui prezzi normali. Nella seduta il prezzo ha oscillato a quota ${curr}${currentPrice.toFixed(2)}, preservando il capitale da ingressi prematuri.`;
    }
  }
  // 4. BOLLINGER BREAKOUT
  else if (strategyId === 'bollinger_breakout') {
    const period = Number(params.bbPeriod || params.period) || 20;
    const stdDev = Number(params.stdDevMultiplier || params.stdDev) || 2.0;
    const bb = calculateBollingerBands(closes, Math.min(period, totalBars), stdDev);
    const upper = bb.upper[bb.upper.length - 1] || currentPrice * 1.02;
    const lower = bb.lower[bb.lower.length - 1] || currentPrice * 0.98;
    triggerLevelLong = upper;
    triggerLevelShort = lower;

    const distLongEur = Math.max(0, upper - currentPrice);
    const distLongPct = upper > currentPrice ? ((upper - currentPrice) / currentPrice) * 100 : 0;
    const isBreakout = currentPrice >= upper;

    conditions.push({
      id: 'bb_upper',
      name: `Banda Superiore Bollinger (${period}, ${stdDev}σ)`,
      category: 'TRIGGER',
      description: `Il prezzo deve rompere la banda superiore a ${curr}${upper.toFixed(2)} con espansione di volatilità.`,
      status: isBreakout ? 'SATISFIED' : 'WAITING',
      currentValueText: `${curr}${currentPrice.toFixed(2)}`,
      requiredValueText: `≥ ${curr}${upper.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: distLongPct > 0 ? `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)` : 'Banda Superata!',
      explanation: isBreakout
        ? 'Prezzo sopra la banda superiore: breakout di volatilità confermato.'
        : `Prezzo all'interno delle bande (${curr}${lower.toFixed(2)} - ${curr}${upper.toFixed(2)}). Manca un +${distLongPct.toFixed(2)}% per rompere al rialzo.`,
      importance: 'CRITICAL',
    });

    if (!hasOpenPosition) {
      overallStatus = isBreakout ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isBreakout ? 'Breakout di Volatilità Confermato' : `In Attesa di Rottura Banda a ${curr}${upper.toFixed(2)}`;
      overallStatusDescription = `La strategia attende che il prezzo superi quota ${curr}${upper.toFixed(2)} per confermare l'avvio del trend.`;
      primaryWaitingReason = `Prezzo a ${curr}${currentPrice.toFixed(2)}, banda superiore a ${curr}${upper.toFixed(2)} (+${distLongPct.toFixed(2)}%).`;
      humanExplanation = `La strategia Bollinger Breakout attende un'esplosione di volatilità sopra ${curr}${upper.toFixed(2)}. Il movimento odierno è rimasto all'interno del canale di oscillazione naturale.`;
    }
  }
  // 5. SUPERTREND TREND FOLLOWING
  else if (strategyId === 'supertrend_trend' || strategyId === 'super_trend') {
    const period = Number(params.atrPeriod) || 10;
    const mult = Number(params.atrMultiplier || params.multiplier) || 3.0;
    const rsiMin = Number(params.rsiMinThreshold) || 50;

    const st = calculateSuperTrend(bars, Math.min(period, totalBars), mult);
    const lastSt = st.superTrend[st.superTrend.length - 1] || currentPrice;
    const lastDir = st.direction[st.direction.length - 1] || 'BULLISH';
    triggerLevelLong = lastSt;

    const rsiVals = calculateRSI(closes, 14);
    const currRsi = rsiVals[rsiVals.length - 1] || 50;
    const passesRsi = currRsi >= rsiMin;

    const isBullish = lastDir === 'BULLISH';
    const distLongEur = Math.max(0, lastSt - currentPrice);
    const distLongPct = !isBullish && lastSt > currentPrice ? ((lastSt - currentPrice) / currentPrice) * 100 : 0;

    conditions.push({
      id: 'supertrend_status',
      name: `SuperTrend (${period}, ${mult}x)`,
      category: 'TRIGGER',
      description: 'L\'indicatore SuperTrend deve virare in modalità rialzista (linea verde sotto al prezzo).',
      status: isBullish ? 'SATISFIED' : 'WAITING',
      currentValueText: `Livello: ${curr}${lastSt.toFixed(2)} (${isBullish ? 'BULLISH' : 'BEARISH'})`,
      requiredValueText: 'Modalità BULLISH (Verde)',
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: isBullish ? 'Trend Rialzista Attivo' : `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      explanation: isBullish
        ? `SuperTrend attivo in modalità rialzista: supporto dinamico a ${curr}${lastSt.toFixed(2)}`
        : `SuperTrend in modalità ribassista a ${curr}${lastSt.toFixed(2)}. Si attende la rottura rialzista di quota ${curr}${lastSt.toFixed(2)}.`,
      importance: 'CRITICAL',
    });

    conditions.push({
      id: 'supertrend_rsi',
      name: `Filtro RSI (${rsiMin})`,
      category: 'VOLATILITY_FILTER',
      description: `RSI deve essere ≥ ${rsiMin} per confermare forza direzionale.`,
      status: passesRsi ? 'SATISFIED' : 'WAITING',
      currentValueText: `RSI = ${currRsi.toFixed(1)}`,
      requiredValueText: `≥ ${rsiMin}`,
      explanation: passesRsi
        ? `Momentum RSI valido a ${currRsi.toFixed(1)}.`
        : `RSI a ${currRsi.toFixed(1)} inferiore alla soglia minima ${rsiMin}.`,
      importance: 'SECONDARY',
    });

    if (!hasOpenPosition) {
      const isReady = isBullish && passesRsi;
      overallStatus = isReady ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isReady ? 'SuperTrend Rialzista Confermato' : `In Attesa di Inversione SuperTrend (${curr}${lastSt.toFixed(2)})`;
      overallStatusDescription = `La linea di resistenza SuperTrend è a quota ${curr}${lastSt.toFixed(2)}. Si attende la rottura rialzista.`;
      primaryWaitingReason = isBullish ? (passesRsi ? 'Pronto' : 'RSI sotto soglia minima.') : `SuperTrend ribassista (resistenza a ${curr}${lastSt.toFixed(2)}).`;
      humanExplanation = `La strategia SuperTrend su ${instrument.ticker} monitora la linea trailing basata su ATR. La posizione verrà aperta non appena il prezzo chiuderà al di sopra di quota ${curr}${lastSt.toFixed(2)}.`;
    }
  }
  // 6. VOLUME VWAP REVERSAL
  else if (strategyId === 'volume_vwap') {
    const volMult = Number(params.volumeThresholdMultiplier) || 1.3;
    const bandPct = Number(params.vwapBandPct) || 0.8;
    const vwapSeries = calculateVWAP(bars);
    const currVwap = vwapSeries[vwapSeries.length - 1] || currentPrice;

    const volumes = bars.map((b) => b.volume);
    const volSma = calculateSMA(volumes, 20);
    const currVol = volumes[volumes.length - 1] || 0;
    const avgVol = volSma[volSma.length - 1] || 1;
    const hasVolume = currVol >= avgVol * volMult;

    const vwapBandPrice = currVwap * (1 + bandPct / 100);
    triggerLevelLong = vwapBandPrice;
    triggerLevelShort = currVwap * (1 - bandPct / 100);

    const distLongEur = Math.abs(currentPrice - currVwap);
    const distLongPct = currVwap > 0 ? (distLongEur / currVwap) * 100 : 0;
    const isAtVwap = distLongPct <= bandPct;

    conditions.push({
      id: 'vwap_level',
      name: 'Allineamento VWAP Istituzionale',
      category: 'TRIGGER',
      description: `Il prezzo deve riallinearsi entro il ${bandPct}% del VWAP (${curr}${currVwap.toFixed(2)}).`,
      status: isAtVwap ? 'SATISFIED' : 'WAITING',
      currentValueText: `Prezzo: ${curr}${currentPrice.toFixed(2)} | VWAP: ${curr}${currVwap.toFixed(2)}`,
      requiredValueText: `Entro il ±${bandPct}% dal VWAP (${curr}${currVwap.toFixed(2)})`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: `Distanza dal VWAP: ${distLongPct.toFixed(2)}% (${curr}${distLongEur.toFixed(2)})`,
      explanation: isAtVwap
        ? `Prezzo in fascia ottimale di carico sul VWAP (${curr}${currVwap.toFixed(2)}).`
        : `Prezzo distante dal VWAP del ${distLongPct.toFixed(2)}%. La strategia attende il ritracciamento verso ${curr}${currVwap.toFixed(2)}.`,
      importance: 'CRITICAL',
    });

    conditions.push({
      id: 'vwap_volume',
      name: 'Spike Volumetrico Istituzionale',
      category: 'VOLATILITY_FILTER',
      description: `Volume deve superare ${volMult}x la media a 20 periodi.`,
      status: hasVolume ? 'SATISFIED' : 'WAITING',
      currentValueText: `${currVol.toLocaleString()} (${((currVol / avgVol) * 100).toFixed(0)}% della media)`,
      requiredValueText: `≥ ${(avgVol * volMult).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      explanation: hasVolume
        ? 'Forte presenza istituzionale confermata dai volumi di scambio.'
        : 'Volumi nella norma. Si attende un incremento di ordini istituzionali sul VWAP.',
      importance: 'SECONDARY',
    });

    if (!hasOpenPosition) {
      overallStatus = isAtVwap && hasVolume ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isAtVwap && hasVolume ? 'Setup VWAP Attivo' : `In Attesa di Ritracciamento su VWAP (${curr}${currVwap.toFixed(2)})`;
      overallStatusDescription = `La strategia cerca rimbalzi difesi dal VWAP a ${curr}${currVwap.toFixed(2)}.`;
      primaryWaitingReason = isAtVwap ? 'In attesa di spike di volume.' : `Prezzo distante dal VWAP del ${distLongPct.toFixed(2)}%.`;
      humanExplanation = `La strategia VWAP Volume monitora i prezzi medi di carico istituzionali. Rimane in attesa che il titolo tocchi quota ${curr}${currVwap.toFixed(2)} con volumi elevati prima di rischiare capitale.`;
    }
  }
  // 7. DUAL MOMENTUM (ROC + EMA Trend)
  else if (strategyId === 'dual_momentum') {
    const rocP = Number(params.rocPeriod) || 21;
    const rocThresh = Number(params.rocThreshold) || 1.5;
    const emaP = Number(params.emaTrendPeriod) || 50;

    const emaTrend = calculateEMA(closes, Math.min(emaP, totalBars));
    const currEma = emaTrend[emaTrend.length - 1] || currentPrice;
    trendFilterLevel = currEma;

    const pastPrice = closes[Math.max(0, closes.length - 1 - rocP)] || currentPrice;
    const rocPct = pastPrice > 0 ? ((currentPrice - pastPrice) / pastPrice) * 100 : 0;
    const priceForRoc = pastPrice * (1 + rocThresh / 100);

    triggerLevelLong = Math.max(priceForRoc, currEma);
    const distLongEur = Math.max(0, triggerLevelLong - currentPrice);
    const distLongPct = triggerLevelLong > currentPrice ? ((triggerLevelLong - currentPrice) / currentPrice) * 100 : 0;

    const passesRoc = rocPct >= rocThresh;
    const passesEma = currentPrice >= currEma;

    conditions.push({
      id: 'dual_roc',
      name: `Momentum ROC ${rocP} Periodi`,
      category: 'TRIGGER',
      description: `Rate of Change a ${rocP} periodi deve superare +${rocThresh}% (Target prezzo: ${curr}${priceForRoc.toFixed(2)}).`,
      status: passesRoc ? 'SATISFIED' : 'WAITING',
      currentValueText: `ROC = ${rocPct.toFixed(2)}%`,
      requiredValueText: `≥ +${rocThresh.toFixed(2)}% (Prezzo ≥ ${curr}${priceForRoc.toFixed(2)})`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: passesRoc ? 'ROC Confermato' : `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      explanation: passesRoc
        ? `Accelerazione positiva verificata (+${rocPct.toFixed(2)}%).`
        : `Momentum insufficiente (${rocPct.toFixed(2)}% < ${rocThresh}%). Il titolo deve raggiungere quota ${curr}${priceForRoc.toFixed(2)}.`,
      importance: 'CRITICAL',
    });

    conditions.push({
      id: 'dual_ema',
      name: `Filtro Trend EMA ${emaP}`,
      category: 'TREND_FILTER',
      description: `Il prezzo deve trovarsi sopra la media mobile EMA ${emaP} (${curr}${currEma.toFixed(2)}).`,
      status: passesEma ? 'SATISFIED' : 'BLOCKED',
      currentValueText: `${curr}${currentPrice.toFixed(2)}`,
      requiredValueText: `> ${curr}${currEma.toFixed(2)}`,
      explanation: passesEma ? 'Filtro di trend positivo.' : 'Prezzo sotto la EMA direzionale.',
      importance: 'CRITICAL',
    });

    if (!hasOpenPosition) {
      const isReady = passesRoc && passesEma;
      overallStatus = isReady ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isReady ? 'Dual Momentum Attivo' : `In Attesa di Accelerazione a ${curr}${triggerLevelLong.toFixed(2)}`;
      overallStatusDescription = `La strategia attende che il titolo superi quota ${curr}${triggerLevelLong.toFixed(2)} (+${distLongPct.toFixed(2)}%) per confermare la ripresa dell'impulso.`;
      primaryWaitingReason = !passesEma ? 'Prezzo sotto la EMA direzionale.' : `ROC a ${rocPct.toFixed(2)}% (richiesto +${rocThresh}%).`;
      humanExplanation = `La strategia Dual Momentum combina accelerazione di breve e filtro di medio termine. Non apre posizioni durante le fasi di rallentamento, attendendo che quota ${curr}${triggerLevelLong.toFixed(2)} venga superata.`;
    }
  }
  // 8. MACD MOMENTUM
  else if (strategyId === 'macd_momentum') {
    const fastP = Number(params.fastPeriod) || 12;
    const slowP = Number(params.slowPeriod) || 26;
    const sigP = Number(params.signalPeriod) || 9;

    const macdRes = calculateMACD(closes, fastP, slowP, sigP);
    const currMacd = macdRes.macd[macdRes.macd.length - 1] ?? 0;
    const currSig = macdRes.signal[macdRes.signal.length - 1] ?? 0;
    const isCrossUp = currMacd > currSig;

    const targetMacdCrossPrice = isCrossUp
      ? currentPrice
      : findPriceForMacdCross(closes, fastP, slowP, sigP);

    triggerLevelLong = targetMacdCrossPrice;
    const distLongEur = Math.max(0, targetMacdCrossPrice - currentPrice);
    const distLongPct = targetMacdCrossPrice > currentPrice
      ? ((targetMacdCrossPrice - currentPrice) / currentPrice) * 100
      : 0;

    conditions.push({
      id: 'macd_cross',
      name: `Incrocio MACD (${fastP}, ${slowP}, ${sigP})`,
      category: 'TRIGGER',
      description: `La linea MACD deve incrociare verso l'alto la Signal Line (prezzo calcolato di rottura: ${curr}${targetMacdCrossPrice.toFixed(2)}).`,
      status: isCrossUp ? 'SATISFIED' : 'WAITING',
      currentValueText: `MACD: ${currMacd.toFixed(2)} | Signal: ${currSig.toFixed(2)}`,
      requiredValueText: `MACD > Signal (Prezzo ≥ ${curr}${targetMacdCrossPrice.toFixed(2)})`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: isCrossUp ? 'Incrocio Attivo' : `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      explanation: isCrossUp
        ? 'MACD sopra Signal Line: accelerazione di momentum rialzista attiva.'
        : `MACD (${currMacd.toFixed(2)}) sotto Signal (${currSig.toFixed(2)}). Manca un movimento fino a quota ${curr}${targetMacdCrossPrice.toFixed(2)} per invertire la pendenza.`,
      importance: 'CRITICAL',
    });

    if (!hasOpenPosition) {
      overallStatus = isCrossUp ? 'READY_TO_ENTER' : 'WAITING_TRIGGER';
      overallStatusTitle = isCrossUp ? 'MACD Rialzista Confermato' : `In Attesa di Incrocio MACD a ${curr}${targetMacdCrossPrice.toFixed(2)}`;
      overallStatusDescription = `La strategia attende l'incrocio rialzista a quota ${curr}${targetMacdCrossPrice.toFixed(2)} (+${distLongPct.toFixed(2)}%).`;
      primaryWaitingReason = isCrossUp ? 'Pronto all\'ingresso.' : `MACD sotto la Signal Line (+${distLongPct.toFixed(2)}% al cross).`;
      humanExplanation = `La strategia MACD Momentum monitora la transizione da fase neutrale a impulso direzionale. Durante la giornata il prezzo non ha forzato la rottura, mantenendo la posizione chiusa.`;
    }
  }
  // 9. MULTI-ASSET PORTFOLIO BUNDLE OR GENERIC DYNAMIC
  else {
    // Dynamic Donchian 20-channel / Swing high calculation - strictly grounded, zero magic numbers
    const lookback = Math.min(20, totalBars);
    const recentHigh = Math.max(...bars.slice(-lookback).map((b) => b.high));
    const recentLow = Math.min(...bars.slice(-lookback).map((b) => b.low));
    triggerLevelLong = recentHigh > currentPrice ? recentHigh : currentPrice * 1.012;
    triggerLevelShort = recentLow < currentPrice ? recentLow : currentPrice * 0.988;

    const distLongEur = Math.max(0, triggerLevelLong - currentPrice);
    const distLongPct = triggerLevelLong > currentPrice ? ((triggerLevelLong - currentPrice) / currentPrice) * 100 : 0;

    conditions.push({
      id: 'rule_trigger',
      name: `Trigger Breakout Recente (${lookback} Barre)`,
      category: 'TRIGGER',
      description: `Rottura della resistenza a ${curr}${triggerLevelLong.toFixed(2)} calcolata sui massimi delle ultime ${lookback} barre.`,
      status: currentPrice >= triggerLevelLong ? 'SATISFIED' : 'WAITING',
      currentValueText: `${curr}${currentPrice.toFixed(2)}`,
      requiredValueText: `≥ ${curr}${triggerLevelLong.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      distancePct: parseFloat(distLongPct.toFixed(2)),
      distanceText: `Mancano +${curr}${distLongEur.toFixed(2)} (+${distLongPct.toFixed(2)}%)`,
      explanation: currentPrice >= triggerLevelLong
        ? 'Massimo di periodo superato.'
        : `Il prezzo è all'interno del canale di oscillazione (${curr}${triggerLevelShort.toFixed(2)} - ${curr}${triggerLevelLong.toFixed(2)}).`,
      importance: 'CRITICAL',
    });

    if (!hasOpenPosition) {
      overallStatus = 'WAITING_TRIGGER';
      overallStatusTitle = `In Attesa di Breakout a ${curr}${triggerLevelLong.toFixed(2)}`;
      overallStatusDescription = `La strategia attende il superamento della resistenza a quota ${curr}${triggerLevelLong.toFixed(2)} (+${distLongPct.toFixed(2)}%).`;
      primaryWaitingReason = `Resistenza a ${curr}${triggerLevelLong.toFixed(2)}, prezzo attuale a ${curr}${currentPrice.toFixed(2)}.`;
      humanExplanation = `La strategia sistematica su ${instrument.ticker} monitora i livelli chiave di breakout. Non opera in assenza di segnale per proteggere il capitale contro il rumore di mercato.`;
    }
  }

  // Build chart bars with trigger overlays (last 35-50 bars for crisp display)
  const recentSlice = bars.slice(Math.max(0, bars.length - 45));
  const chartBars = recentSlice.map((b) => {
    return {
      timestamp: b.timestamp,
      dateStr: b.dateStr.includes(' ') ? b.dateStr.split(' ')[0] : b.dateStr,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      triggerLevel: triggerLevelLong ? parseFloat(triggerLevelLong.toFixed(2)) : undefined,
      trendFilterLevel: trendFilterLevel ? parseFloat(trendFilterLevel.toFixed(2)) : undefined,
      stopLossLevel: plannedStopLoss ? parseFloat(plannedStopLoss.toFixed(2)) : undefined,
      takeProfitLevel: plannedTakeProfit ? parseFloat(plannedTakeProfit.toFixed(2)) : undefined,
    };
  });

  const distToLongEur = triggerLevelLong ? Math.max(0, triggerLevelLong - currentPrice) : undefined;
  const distToLongPct = triggerLevelLong ? Math.max(0, ((triggerLevelLong - currentPrice) / currentPrice) * 100) : undefined;

  return {
    strategyId,
    strategyName,
    instrument,
    currentPrice: parseFloat(currentPrice.toFixed(2)),
    currencySymbol: curr,
    overallStatus,
    overallStatusTitle,
    overallStatusDescription,
    primaryWaitingReason,
    humanExplanation,
    triggerLevelLong: triggerLevelLong ? parseFloat(triggerLevelLong.toFixed(2)) : undefined,
    triggerLevelShort: triggerLevelShort ? parseFloat(triggerLevelShort.toFixed(2)) : undefined,
    trendFilterLevel: trendFilterLevel ? parseFloat(trendFilterLevel.toFixed(2)) : undefined,
    plannedStopLoss: plannedStopLoss ? parseFloat(plannedStopLoss.toFixed(2)) : undefined,
    plannedTakeProfit: plannedTakeProfit ? parseFloat(plannedTakeProfit.toFixed(2)) : undefined,
    currentAtr: currentAtr ? parseFloat(currentAtr.toFixed(3)) : undefined,
    distanceToLongTriggerPct: distToLongPct !== undefined ? parseFloat(distToLongPct.toFixed(2)) : undefined,
    distanceToLongTriggerEur: distToLongEur !== undefined ? parseFloat(distToLongEur.toFixed(2)) : undefined,
    conditions,
    chartBars,
  };
}

