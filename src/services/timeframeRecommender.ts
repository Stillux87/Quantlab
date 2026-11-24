/**
 * QuantLab - Timeframe Analyzer & Recommendation Engine
 * Analyzes market noise, spread-to-range ratios, and signal stability
 */
import { Instrument, Timeframe, TimeframeInfo } from '../types';

export const ALL_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D'];

export const TIMEFRAME_DEFINITIONS: Record<Timeframe, { label: string; minutes: number; noiseLevel: TimeframeInfo['noiseLevel'] }> = {
  '1m': { label: '1 Minuto', minutes: 1, noiseLevel: 'EXTREME' },
  '5m': { label: '5 Minuti', minutes: 5, noiseLevel: 'HIGH' },
  '15m': { label: '15 Minuti', minutes: 15, noiseLevel: 'MEDIUM' },
  '30m': { label: '30 Minuti', minutes: 30, noiseLevel: 'MEDIUM' },
  '1h': { label: '1 Ora', minutes: 60, noiseLevel: 'LOW' },
  '2h': { label: '2 Ore', minutes: 120, noiseLevel: 'LOW' },
  '4h': { label: '4 Ore', minutes: 240, noiseLevel: 'LOW' },
  '1D': { label: '1 Giorno (Daily)', minutes: 1440, noiseLevel: 'LOW' },
};

export function analyzeTimeframeSupport(instrument: Instrument, isOverTwoYears?: boolean): TimeframeInfo[] {
  const isETF = instrument.type === 'ETF';
  const isItalianMarket = instrument.market.includes('Borsa Italiana') || instrument.exchangeCode === 'MTA';

  return ALL_TIMEFRAMES.map((tf) => {
    const meta = TIMEFRAME_DEFINITIONS[tf];
    let supported = true;
    let barCountApprox = 0;
    let stabilityScore = 80;
    let recommended = false;
    let recommendationReason = '';

    if (isOverTwoYears) {
      if (tf === '1D') {
        return {
          timeframe: tf,
          label: meta.label,
          minutes: meta.minutes,
          supported: true,
          barCountApprox: 4740,
          noiseLevel: 'LOW' as const,
          stabilityScore: 98,
          recommended: true,
          recommendationReason: 'Timeframe ufficiale per dati storici pluriennali reali al 100% (senza serie sintetiche).',
        };
      }
      return {
        timeframe: tf,
        label: meta.label,
        minutes: meta.minutes,
        supported: false,
        barCountApprox: 0,
        noiseLevel: meta.noiseLevel,
        stabilityScore: 50,
        recommended: false,
        recommendationReason: 'I feed reali di borsa limitano i dati intraday a 2 anni. Disponibile solo per periodi ≤ 2 anni.',
      };
    }

    switch (tf) {
      case '1m':
        // 1m is very noisy for ETFs due to spread
        supported = !isETF || !isItalianMarket;
        barCountApprox = 12000;
        stabilityScore = isETF ? 45 : 60;
        recommendationReason = 'Forte rumore statistico intragiornaliero; alto impatto di spread e commissioni.';
        break;

      case '5m':
        supported = true;
        barCountApprox = 15000;
        stabilityScore = isETF ? 65 : 75;
        recommendationReason = 'Adatto a scalping e intraday rapido su titoli azionari ad alta liquidità.';
        break;

      case '15m':
        supported = true;
        barCountApprox = 12000;
        stabilityScore = 88;
        // 15m is optimal for active ETF trend following and intraday equities
        recommended = isETF;
        recommendationReason = isETF
          ? '⭐ Consigliato per ETF: perfetto bilanciamento tra tempestività di reazione e filtraggio del rumore di spread.'
          : 'Ottima reattività intraday con trend stabili.';
        break;

      case '30m':
        supported = true;
        barCountApprox = 8000;
        stabilityScore = 90;
        recommended = !isETF && instrument.currentPrice > 100;
        recommendationReason = 'Consigliato per swing trading su azioni large-cap: segnali puliti e ridotto overtrading.';
        break;

      case '1h':
        supported = true;
        barCountApprox = 6500;
        stabilityScore = 94;
        recommended = isETF && !isItalianMarket;
        recommendationReason = 'Ideale per strategie basate su medie mobili e breakout multi-sessione.';
        break;

      case '2h':
        supported = true;
        barCountApprox = 5200;
        stabilityScore = 95;
        recommendationReason = 'Ottimo per swing trading intraday e strategie multi-sessione a basso attrito.';
        break;

      case '4h':
        supported = true;
        barCountApprox = 4200;
        stabilityScore = 96;
        recommendationReason = 'Timeframe macro istituzionale: elevata robustezza dei pattern e minima sensibilità allo slippage.';
        break;

      case '1D':
        supported = true;
        barCountApprox = 1930;
        stabilityScore = 98;
        recommendationReason = 'Ideale per trend following a medio/lungo termine e strategie ad accumulazione.';
        break;
    }

    return {
      timeframe: tf,
      label: meta.label,
      minutes: meta.minutes,
      supported,
      barCountApprox,
      noiseLevel: meta.noiseLevel,
      stabilityScore,
      recommended,
      recommendationReason,
    };
  });
}

export function getRecommendedTimeframe(instrument: Instrument, isOverTwoYears?: boolean): {
  timeframe: Timeframe;
  reason: string;
} {
  if (isOverTwoYears) {
    return {
      timeframe: '1D',
      reason: 'Per orizzonti temporali superiori a 2 anni (es. dal 2008 ad oggi), il timeframe 1D (Daily) è l\'unico compatibile con dati storici reali di borsa al 100%, escludendo tassativamente qualsiasi dato sintetico.',
    };
  }

  const infos = analyzeTimeframeSupport(instrument, isOverTwoYears);
  const rec = infos.find((i) => i.recommended) || infos.find((i) => i.timeframe === '15m') || infos[2];

  if (instrument.type === 'ETF') {
    return {
      timeframe: '15m',
      reason: 'Maggiore stabilità dei segnali quantitativi, assorbimento del micro-rumore di quotazione e ottimizzazione dei costi di spread/slippage per fondi ETF.',
    };
  } else {
    return {
      timeframe: '15m',
      reason: 'Eccellente rapporto segnale/rumore e reattività ideale per intercettare i momentum breakout con stop loss calibrati.',
    };
  }
}
