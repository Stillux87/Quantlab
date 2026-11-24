import { INSTRUMENTS_DATABASE } from '../data/instruments';

const POPULAR_ISIN_MAP: Record<string, string> = {
  // Top US Stocks
  AAPL: 'US0378331005',
  MSFT: 'US5949181045',
  NVDA: 'US67066G1040',
  AMZN: 'US0231351067',
  GOOGL: 'US02079K3059',
  GOOG: 'US02079K1079',
  META: 'US30303M1027',
  TSLA: 'US88160R1014',
  BRK_B: 'US0846707026',
  'BRK-B': 'US0846707026',
  JNJ: 'US4781601046',
  JPM: 'US46625H1005',
  V: 'US92826C8394',
  PG: 'US7427181091',
  MA: 'US57636Q1040',
  UNH: 'US91324P1021',
  HD: 'US4370761029',
  DIS: 'US2546871060',
  NFLX: 'US64110L1061',
  INTC: 'US4581401001',
  AMD: 'US0079031078',
  CRM: 'US79466L3024',
  KO: 'US1912161007',
  PEP: 'US7134481081',
  WMT: 'US9311421039',
  COST: 'US22160K1051',
  XOM: 'US30231G1022',
  CVX: 'US1667641005',

  // Top Commodities & Futures
  'CL=F': 'XC000A0AEZE1', // Crude Oil WTI
  'BZ=F': 'XC0009677409', // Brent Crude
  'GC=F': 'XC0009655157', // Gold
  'SI=F': 'XC0009653194', // Silver
  'HG=F': 'XC0009656916', // Copper
  'NG=F': 'XC0009654150', // Natural Gas
  'ES=F': 'XC000A0AEX51', // E-mini S&P 500
  'NQ=F': 'XC000A0AEX77', // E-mini Nasdaq 100
  'YM=F': 'XC000A0AEX85', // E-mini Dow Jones
  'ZB=F': 'XC0009641777', // US 30Y Treasury Bond
  'ZN=F': 'XC0009641785', // US 10Y Treasury Note
  '6E=F': 'XC000A0AEY84', // Euro FX Futures
  'BTC-USD': 'US000000BTC1', // Bitcoin
  'ETH-USD': 'US000000ETH1', // Ethereum

  // Major European & Italian Bluechips
  'ENEL.MI': 'IT0003128367',
  'ISP.MI': 'IT0000072618',
  'UCG.MI': 'IT0005239360',
  'ENI.MI': 'IT0003132476',
  'STLAM.MI': 'NL00150001Q9',
  'RACE.MI': 'NL0011586010',
  'G.MI': 'IT0000062072',
  'CPR.MI': 'NL0015435975',
  'PIRC.MI': 'IT0004623051',
  'TEN.MI': 'LU0156801721',
  'SRG.MI': 'IT0003153415',
  'TRN.MI': 'IT0003242622',
  'PRY.MI': 'IT0004176001',
  'LDO.MI': 'IT0003856405',
  'MONC.MI': 'IT0004965148',
  'STM.MI': 'NL0000226223',
};

/**
 * Returns the ISIN for a ticker by searching the local instruments database,
 * followed by known international securities and futures tickers.
 */
export function resolveInstrumentISIN(symbol: string, fallbackIsin?: string): string {
  if (!symbol) return fallbackIsin || '';

  const clean = symbol.trim().toUpperCase();

  // 1. Direct match in local INSTRUMENTS_DATABASE
  const dbMatch = INSTRUMENTS_DATABASE.find(
    (i) => i.ticker.toUpperCase() === clean || i.id.toUpperCase() === clean
  );
  if (dbMatch?.isin && dbMatch.isin.length > 5) {
    return dbMatch.isin;
  }

  // 2. Direct match in POPULAR_ISIN_MAP
  if (POPULAR_ISIN_MAP[clean]) {
    return POPULAR_ISIN_MAP[clean];
  }

  // 3. Match without exchange suffix (e.g. AAPL.US -> AAPL)
  const baseSymbol = clean.split('.')[0];
  if (POPULAR_ISIN_MAP[baseSymbol]) {
    return POPULAR_ISIN_MAP[baseSymbol];
  }

  // 4. Return provided fallback or structured placeholder
  if (fallbackIsin && fallbackIsin.length > 5 && !fallbackIsin.startsWith('ISIN-')) {
    return fallbackIsin;
  }

  // Generate deterministic clean identifier if no standard ISIN found
  return fallbackIsin || `US${baseSymbol.padEnd(9, '0').slice(0, 9)}1`;
}
