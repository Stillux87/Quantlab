/**
 * QuantLab - Fuzzy Search, Typo Tolerance and Alias Correction Engine
 */
import { Instrument } from '../types';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

// Aliases and common phonetic / brand names for financial instruments
export const SEARCH_ALIASES: Record<string, { ticker: string; confidence: number; label: string }> = {
  // Italian Stocks
  'enel': { ticker: 'ENEL.MI', confidence: 1.0, label: 'Enel S.p.A.' },
  'eneel': { ticker: 'ENEL.MI', confidence: 0.95, label: 'Enel S.p.A.' },
  'enell': { ticker: 'ENEL.MI', confidence: 0.95, label: 'Enel S.p.A.' },
  'intesa': { ticker: 'ISP.MI', confidence: 1.0, label: 'Intesa Sanpaolo' },
  'intes': { ticker: 'ISP.MI', confidence: 0.95, label: 'Intesa Sanpaolo' },
  'sanpaolo': { ticker: 'ISP.MI', confidence: 1.0, label: 'Intesa Sanpaolo' },
  'isp': { ticker: 'ISP.MI', confidence: 1.0, label: 'Intesa Sanpaolo' },
  'ferrari': { ticker: 'RACE.MI', confidence: 1.0, label: 'Ferrari N.V.' },
  'ferarri': { ticker: 'RACE.MI', confidence: 0.95, label: 'Ferrari N.V.' },
  'ferari': { ticker: 'RACE.MI', confidence: 0.95, label: 'Ferrari N.V.' },
  'race': { ticker: 'RACE.MI', confidence: 1.0, label: 'Ferrari N.V.' },
  'unicredit': { ticker: 'UCG.MI', confidence: 1.0, label: 'UniCredit S.p.A.' },
  'unicredito': { ticker: 'UCG.MI', confidence: 0.95, label: 'UniCredit S.p.A.' },
  'unicredt': { ticker: 'UCG.MI', confidence: 0.9, label: 'UniCredit S.p.A.' },
  'ucg': { ticker: 'UCG.MI', confidence: 1.0, label: 'UniCredit S.p.A.' },
  'leonardo': { ticker: 'LDO.MI', confidence: 1.0, label: 'Leonardo S.p.A.' },
  'lonardo': { ticker: 'LDO.MI', confidence: 0.9, label: 'Leonardo S.p.A.' },
  'finmeccanica': { ticker: 'LDO.MI', confidence: 1.0, label: 'Leonardo S.p.A. (ex Finmeccanica)' },
  'ldo': { ticker: 'LDO.MI', confidence: 1.0, label: 'Leonardo S.p.A.' },
  'eni': { ticker: 'ENI.MI', confidence: 1.0, label: 'Eni S.p.A.' },
  'agip': { ticker: 'ENI.MI', confidence: 0.9, label: 'Eni S.p.A.' },
  'plenitude': { ticker: 'ENI.MI', confidence: 0.9, label: 'Eni S.p.A. (Plenitude)' },
  'prysmian': { ticker: 'PRY.MI', confidence: 1.0, label: 'Prysmian S.p.A.' },
  'prismian': { ticker: 'PRY.MI', confidence: 0.95, label: 'Prysmian S.p.A.' },
  'prysmain': { ticker: 'PRY.MI', confidence: 0.95, label: 'Prysmian S.p.A.' },
  'pry': { ticker: 'PRY.MI', confidence: 1.0, label: 'Prysmian S.p.A.' },
  'stellantis': { ticker: 'STLAM.MI', confidence: 1.0, label: 'Stellantis N.V.' },
  'stelantis': { ticker: 'STLAM.MI', confidence: 0.95, label: 'Stellantis N.V.' },
  'stellants': { ticker: 'STLAM.MI', confidence: 0.95, label: 'Stellantis N.V.' },
  'fiat': { ticker: 'STLAM.MI', confidence: 0.95, label: 'Stellantis (Fiat/Chrysler)' },
  'stlam': { ticker: 'STLAM.MI', confidence: 1.0, label: 'Stellantis N.V.' },
  'generali': { ticker: 'G.MI', confidence: 1.0, label: 'Assicurazioni Generali' },
  'generaly': { ticker: 'G.MI', confidence: 0.9, label: 'Assicurazioni Generali' },
  'stmicro': { ticker: 'STMMI.MI', confidence: 1.0, label: 'STMicroelectronics' },
  'stmicroelectronics': { ticker: 'STMMI.MI', confidence: 1.0, label: 'STMicroelectronics' },
  'stm': { ticker: 'STMMI.MI', confidence: 1.0, label: 'STMicroelectronics' },
  'moncler': { ticker: 'MONC.MI', confidence: 1.0, label: 'Moncler S.p.A.' },
  'moncle': { ticker: 'MONC.MI', confidence: 0.9, label: 'Moncler S.p.A.' },
  'poste': { ticker: 'PST.MI', confidence: 1.0, label: 'Poste Italiane' },
  'posteitaliane': { ticker: 'PST.MI', confidence: 1.0, label: 'Poste Italiane' },
  'bancobpm': { ticker: 'BAMI.MI', confidence: 1.0, label: 'Banco BPM' },
  'bpm': { ticker: 'BAMI.MI', confidence: 1.0, label: 'Banco BPM' },
  'fineco': { ticker: 'FBK.MI', confidence: 1.0, label: 'FinecoBank' },
  'finecobank': { ticker: 'FBK.MI', confidence: 1.0, label: 'FinecoBank' },

  // Global Equities
  'apple': { ticker: 'AAPL', confidence: 1.0, label: 'Apple Inc.' },
  'aple': { ticker: 'AAPL', confidence: 0.95, label: 'Apple Inc.' },
  'applle': { ticker: 'AAPL', confidence: 0.95, label: 'Apple Inc.' },
  'iphone': { ticker: 'AAPL', confidence: 0.9, label: 'Apple Inc.' },
  'aapl': { ticker: 'AAPL', confidence: 1.0, label: 'Apple Inc.' },
  'nvidia': { ticker: 'NVDA', confidence: 1.0, label: 'NVIDIA Corporation' },
  'nvdia': { ticker: 'NVDA', confidence: 0.95, label: 'NVIDIA Corporation' },
  'nvida': { ticker: 'NVDA', confidence: 0.95, label: 'NVIDIA Corporation' },
  'geforce': { ticker: 'NVDA', confidence: 0.9, label: 'NVIDIA Corporation' },
  'nvda': { ticker: 'NVDA', confidence: 1.0, label: 'NVIDIA Corporation' },
  'microsoft': { ticker: 'MSFT', confidence: 1.0, label: 'Microsoft Corporation' },
  'microsof': { ticker: 'MSFT', confidence: 0.95, label: 'Microsoft Corporation' },
  'windows': { ticker: 'MSFT', confidence: 0.9, label: 'Microsoft Corporation' },
  'msft': { ticker: 'MSFT', confidence: 1.0, label: 'Microsoft Corporation' },
  'amazon': { ticker: 'AMZN', confidence: 1.0, label: 'Amazon.com, Inc.' },
  'amzon': { ticker: 'AMZN', confidence: 0.95, label: 'Amazon.com, Inc.' },
  'amzn': { ticker: 'AMZN', confidence: 1.0, label: 'Amazon.com, Inc.' },
  'google': { ticker: 'GOOGL', confidence: 1.0, label: 'Alphabet Inc. (Google)' },
  'gogle': { ticker: 'GOOGL', confidence: 0.95, label: 'Alphabet Inc. (Google)' },
  'goog': { ticker: 'GOOGL', confidence: 1.0, label: 'Alphabet Inc. (Google)' },
  'googl': { ticker: 'GOOGL', confidence: 1.0, label: 'Alphabet Inc. (Google)' },
  'meta': { ticker: 'META', confidence: 1.0, label: 'Meta Platforms (Facebook)' },
  'facebook': { ticker: 'META', confidence: 1.0, label: 'Meta Platforms (Facebook)' },
  'fb': { ticker: 'META', confidence: 1.0, label: 'Meta Platforms (Facebook)' },
  'tesla': { ticker: 'TSLA', confidence: 1.0, label: 'Tesla, Inc.' },
  'telsa': { ticker: 'TSLA', confidence: 0.95, label: 'Tesla, Inc.' },
  'tsla': { ticker: 'TSLA', confidence: 1.0, label: 'Tesla, Inc.' },
  'jpmorgan': { ticker: 'JPM', confidence: 1.0, label: 'JPMorgan Chase & Co.' },
  'jp morgan': { ticker: 'JPM', confidence: 1.0, label: 'JPMorgan Chase & Co.' },
  'broadcom': { ticker: 'AVGO', confidence: 1.0, label: 'Broadcom Inc.' },
  'asml': { ticker: 'ASML.AS', confidence: 1.0, label: 'ASML Holding N.V.' },
  'lvmh': { ticker: 'MC.PA', confidence: 1.0, label: 'LVMH Moët Hennessy' },
  'louis vuitton': { ticker: 'MC.PA', confidence: 0.95, label: 'LVMH Moët Hennessy' },
  'sap': { ticker: 'SAP.DE', confidence: 1.0, label: 'SAP SE' },

  // ETFs
  'sp500': { ticker: 'SPY', confidence: 1.0, label: 'SPDR S&P 500 ETF Trust' },
  's&p500': { ticker: 'SPY', confidence: 1.0, label: 'SPDR S&P 500 ETF Trust' },
  's&p 500': { ticker: 'SPY', confidence: 1.0, label: 'SPDR S&P 500 ETF Trust' },
  'spy': { ticker: 'SPY', confidence: 1.0, label: 'SPDR S&P 500 ETF Trust' },
  'nasdaq': { ticker: 'QQQ', confidence: 1.0, label: 'Invesco QQQ Trust (Nasdaq 100)' },
  'nasdaq 100': { ticker: 'QQQ', confidence: 1.0, label: 'Invesco QQQ Trust (Nasdaq 100)' },
  'qqq': { ticker: 'QQQ', confidence: 1.0, label: 'Invesco QQQ Trust (Nasdaq 100)' },
  'vanguard': { ticker: 'VWCE.DE', confidence: 0.95, label: 'Vanguard FTSE All-World (VWCE)' },
  'all world': { ticker: 'VWCE.DE', confidence: 1.0, label: 'Vanguard FTSE All-World (VWCE)' },
  'all-world': { ticker: 'VWCE.DE', confidence: 1.0, label: 'Vanguard FTSE All-World (VWCE)' },
  'vwce': { ticker: 'VWCE.DE', confidence: 1.0, label: 'Vanguard FTSE All-World' },
  'msci world': { ticker: 'SWDA.MI', confidence: 1.0, label: 'iShares Core MSCI World (SWDA)' },
  'swda': { ticker: 'SWDA.MI', confidence: 1.0, label: 'iShares Core MSCI World' },
  'ishares world': { ticker: 'SWDA.MI', confidence: 0.95, label: 'iShares Core MSCI World' },
  'emerging': { ticker: 'EIMI.MI', confidence: 0.95, label: 'iShares Core MSCI EM IMI' },
  'emergenti': { ticker: 'EIMI.MI', confidence: 0.95, label: 'iShares Core MSCI EM IMI' },
  'eimi': { ticker: 'EIMI.MI', confidence: 1.0, label: 'iShares Core MSCI EM IMI' },
  'gold': { ticker: 'GLD', confidence: 1.0, label: 'SPDR Gold Shares' },
  'oro': { ticker: 'GLD', confidence: 1.0, label: 'SPDR Gold Shares' },
  'gld': { ticker: 'GLD', confidence: 1.0, label: 'SPDR Gold Shares' },
  'treasury': { ticker: 'TLT', confidence: 1.0, label: 'iShares 20+ Year Treasury Bond ETF' },
  'bonds': { ticker: 'TLT', confidence: 0.9, label: 'iShares 20+ Year Treasury Bond ETF' },
  'tlt': { ticker: 'TLT', confidence: 1.0, label: 'iShares 20+ Year Treasury Bond ETF' },
};

/**
 * Levenshtein distance calculation for typo tolerance
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = new Array<number[]>(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    let row = (matrix[i] = new Array<number>(an + 1));
    row[0] = i;
  }
  for (let j = 1; j <= an; ++j) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * Normalized similarity score between 0.0 and 1.0
 */
export function getSimilarityScore(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.85;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const dist = getLevenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

export interface SearchSuggestionResult {
  hasCorrection: boolean;
  correctionText?: string;
  suggestedInstrument?: Instrument;
  matches: Array<{
    instrument: Instrument;
    score: number;
    matchReason: 'EXACT' | 'PREFIX' | 'ALIAS' | 'TYPO_CORRECTION' | 'SUBSTRING';
  }>;
}

/**
 * Comprehensive Smart Search with Typo Detection
 */
export function getSmartSearchResults(
  query: string,
  instruments: Instrument[] = INSTRUMENTS_DATABASE
): SearchSuggestionResult {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) {
    return {
      hasCorrection: false,
      matches: instruments.slice(0, 10).map((i) => ({
        instrument: i,
        score: 1,
        matchReason: 'EXACT',
      })),
    };
  }

  // Check direct alias dictionary first
  const aliasMatch = SEARCH_ALIASES[cleanQ];
  let topCorrectionInstrument: Instrument | undefined;
  let correctionText: string | undefined;

  if (aliasMatch) {
    const found = instruments.find((i) => i.ticker.toUpperCase() === aliasMatch.ticker.toUpperCase());
    if (found) {
      topCorrectionInstrument = found;
      // If user typed something slightly different from the ticker/name
      if (cleanQ !== found.ticker.toLowerCase() && cleanQ !== found.name.toLowerCase()) {
        correctionText = `${found.name} (${found.ticker})`;
      }
    }
  }

  const scoredList: Array<{
    instrument: Instrument;
    score: number;
    matchReason: 'EXACT' | 'PREFIX' | 'ALIAS' | 'TYPO_CORRECTION' | 'SUBSTRING';
  }> = [];

  for (const inst of instruments) {
    const tickerClean = inst.ticker.toLowerCase();
    const tickerPrefix = tickerClean.split('.')[0]; // e.g. "enel" from "enel.mi"
    const nameClean = inst.name.toLowerCase();
    const isinClean = inst.isin.toLowerCase();
    const sectorClean = inst.sector.toLowerCase();

    // 1. Exact Match
    if (tickerClean === cleanQ || tickerPrefix === cleanQ || isinClean === cleanQ) {
      scoredList.push({ instrument: inst, score: 1.0, matchReason: 'EXACT' });
      continue;
    }

    // 2. Starts with / Prefix match
    if (tickerClean.startsWith(cleanQ) || tickerPrefix.startsWith(cleanQ) || nameClean.startsWith(cleanQ)) {
      scoredList.push({ instrument: inst, score: 0.9, matchReason: 'PREFIX' });
      continue;
    }

    // 3. Substring match in name or sector
    if (nameClean.includes(cleanQ) || isinClean.includes(cleanQ) || sectorClean.includes(cleanQ)) {
      scoredList.push({ instrument: inst, score: 0.8, matchReason: 'SUBSTRING' });
      continue;
    }

    // 4. Fuzzy / Typo tolerance against ticker, ticker prefix, or words in name
    const tickerSim = Math.max(
      getSimilarityScore(cleanQ, tickerClean),
      getSimilarityScore(cleanQ, tickerPrefix)
    );

    const nameWords = nameClean.split(/[\s,.-]+/);
    let maxWordSim = 0;
    for (const w of nameWords) {
      if (w.length >= 3) {
        const sim = getSimilarityScore(cleanQ, w);
        if (sim > maxWordSim) maxWordSim = sim;
      }
    }

    const bestFuzzyScore = Math.max(tickerSim, maxWordSim);

    if (bestFuzzyScore >= 0.62) {
      scoredList.push({
        instrument: inst,
        score: bestFuzzyScore * 0.75,
        matchReason: 'TYPO_CORRECTION',
      });
    }
  }

  // Sort results by score descending
  scoredList.sort((a, b) => b.score - a.score);

  // If we had no direct exact match but we found a typo correction with high score
  const firstMatch = scoredList[0];
  let hasCorrection = false;

  if (firstMatch && firstMatch.matchReason === 'TYPO_CORRECTION') {
    hasCorrection = true;
    topCorrectionInstrument = firstMatch.instrument;
    correctionText = `${firstMatch.instrument.name} (${firstMatch.instrument.ticker})`;
  } else if (aliasMatch && topCorrectionInstrument && cleanQ !== topCorrectionInstrument.ticker.toLowerCase()) {
    hasCorrection = true;
    correctionText = `${topCorrectionInstrument.name} (${topCorrectionInstrument.ticker})`;
  }

  return {
    hasCorrection,
    correctionText,
    suggestedInstrument: topCorrectionInstrument,
    matches: scoredList,
  };
}
