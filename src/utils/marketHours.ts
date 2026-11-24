/**
 * Market Hours and Exchange Trading Schedule Validator
 * Ensures paper trading NEVER opens trades on closed markets (weekends, off-hours, holidays)
 */

export interface MarketStatus {
  isOpen: boolean;
  state: 'REGULAR' | 'CLOSED' | 'PRE' | 'POST' | 'WEEKEND';
  exchangeName: string;
  reason: string;
  nextOpenNotice?: string;
}

export interface UsHolidayInfo {
  name: string;
  isEarlyCloseFutures: boolean;
  futuresHaltUtcMinutes: number;
  futuresResumeUtcMinutes: number;
  equitiesClosed: boolean;
}

/**
 * Recognizes US Federal & Financial Market Holidays (Labor Day, Memorial Day, Thanksgiving, etc.)
 */
export function getUsHolidayInfo(date: Date): UsHolidayInfo | null {
  const month = date.getUTCMonth(); // 0 = Jan, 4 = May, 6 = Jul, 8 = Sep, 10 = Nov
  const day = date.getUTCDate();
  const dayOfWeek = date.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // 1. Labor Day: 1st Monday in September (Month 8, day 1..7, dayOfWeek 1)
  if (month === 8 && dayOfWeek === 1 && day <= 7) {
    return {
      name: 'Labor Day (Festa del Lavoro USA)',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 18 * 60 + 30, // 18:30 UTC (14:30 ET / 13:30 CT)
      futuresResumeUtcMinutes: 22 * 60,     // 22:00 UTC (18:00 ET)
      equitiesClosed: true,
    };
  }

  // 2. Memorial Day: Last Monday in May (Month 4, day 25..31, dayOfWeek 1)
  if (month === 4 && dayOfWeek === 1 && day >= 25) {
    return {
      name: 'Memorial Day USA',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 18 * 60 + 30,
      futuresResumeUtcMinutes: 22 * 60,
      equitiesClosed: true,
    };
  }

  // 3. Independence Day: July 4th (Month 6, day 4)
  if (month === 6 && day === 4) {
    return {
      name: 'Independence Day USA',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 17 * 60,
      futuresResumeUtcMinutes: 22 * 60,
      equitiesClosed: true,
    };
  }

  // 4. Thanksgiving Day: 4th Thursday in November (Month 10, dayOfWeek 4, day 22..28)
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) {
    return {
      name: 'Thanksgiving Day USA',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 18 * 60,
      futuresResumeUtcMinutes: 23 * 60,
      equitiesClosed: true,
    };
  }

  // 5. Martin Luther King Jr. Day (3rd Monday in Jan: Month 0, day 15..21, dayOfWeek 1)
  if (month === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) {
    return {
      name: 'Martin Luther King Jr. Day',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 18 * 60 + 30,
      futuresResumeUtcMinutes: 22 * 60,
      equitiesClosed: true,
    };
  }

  // 6. Presidents Day (3rd Monday in Feb: Month 1, day 15..21, dayOfWeek 1)
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) {
    return {
      name: 'Presidents Day USA',
      isEarlyCloseFutures: true,
      futuresHaltUtcMinutes: 18 * 60 + 30,
      futuresResumeUtcMinutes: 22 * 60,
      equitiesClosed: true,
    };
  }

  return null;
}

export function isMarketOpenForSymbol(symbol: string, feedMarketState?: string): MarketStatus {
  const sym = (symbol || '').trim().toUpperCase();

  // If feed explicitly reports closed/pre/post, honor it
  if (feedMarketState) {
    const s = feedMarketState.toUpperCase();
    if (s === 'CLOSED') {
      return {
        isOpen: false,
        state: 'CLOSED',
        exchangeName: getExchangeName(sym),
        reason: 'Mercato Chiuso (Feed Ufficiale Exchange: CLOSED)',
      };
    }
    if (s === 'PRE') {
      return {
        isOpen: false,
        state: 'PRE',
        exchangeName: getExchangeName(sym),
        reason: 'Fase Pre-Market (Ordini regolari non consentiti)',
      };
    }
    if (s === 'POST') {
      return {
        isOpen: false,
        state: 'POST',
        exchangeName: getExchangeName(sym),
        reason: 'Fase After-Hours / Post-Market (Ordini regolari non consentiti)',
      };
    }
  }

  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const hour = now.getUTCHours();
  const min = now.getUTCMinutes();
  const utcMinutes = hour * 60 + min;

  // 1. SATURDAY: ALL stock, ETF, commodity, future, bond, and forex markets are closed worldwide.
  if (day === 6) {
    return {
      isOpen: false,
      state: 'WEEKEND',
      exchangeName: getExchangeName(sym),
      reason: 'Mercato Chiuso (Sabato - Weekend di Borsa)',
      nextOpenNotice: 'Riapertura mercati prevista lunedì',
    };
  }

  // 2. SUNDAY:
  if (day === 0) {
    // Futures and Forex open at 22:00 UTC (18:00 US Eastern)
    const isFutureOrForex = sym.includes('=F') || sym.includes('=X') || isForexPair(sym);
    if (isFutureOrForex && utcMinutes >= 22 * 60) {
      return {
        isOpen: true,
        state: 'REGULAR',
        exchangeName: getExchangeName(sym),
        reason: 'Mercato Aperto (Sessione Globale Futures/Forex Domenica Sera)',
      };
    }

    return {
      isOpen: false,
      state: 'WEEKEND',
      exchangeName: getExchangeName(sym),
      reason: isFutureOrForex
        ? 'Mercato Chiuso (Domenica - Riapertura Futures/Forex alle 22:00 UTC)'
        : 'Mercato Chiuso (Domenica - Azionario e ETF riaprono lunedì)',
      nextOpenNotice: isFutureOrForex ? 'Riapertura domenica ore 22:00 UTC' : 'Riapertura lunedì mattina',
    };
  }

  // 3. MONDAY TO FRIDAY:
  const usHoliday = getUsHolidayInfo(now);

  // 3A. Futures (e.g. ES=F, NQ=F, CL=F, GC=F, etc.)
  if (sym.includes('=F')) {
    // US Holiday early close on CME / NYMEX futures (e.g. Labor Day halt from 18:30 to 22:00 UTC)
    if (usHoliday && usHoliday.isEarlyCloseFutures) {
      if (utcMinutes >= usHoliday.futuresHaltUtcMinutes && utcMinutes < usHoliday.futuresResumeUtcMinutes) {
        return {
          isOpen: false,
          state: 'CLOSED',
          exchangeName: 'NYMEX / CME Futures',
          reason: `Festività USA (${usHoliday.name}) - Chiusura anticipata NYMEX/CME alle 18:30 UTC`,
          nextOpenNotice: 'Riapertura contrattazioni CME Globex alle ore 22:00 UTC (00:00 IT)',
        };
      }
    }

    // Friday close at 21:00 UTC
    if (day === 5 && utcMinutes >= 21 * 60) {
      return {
        isOpen: false,
        state: 'WEEKEND',
        exchangeName: 'CME / Globex Futures',
        reason: 'Mercato Futures Chiuso per il weekend (Chiusura Venerdì 21:00 UTC)',
      };
    }
    // Daily maintenance halt: 21:00 - 22:00 UTC Mon-Thu
    if (utcMinutes >= 21 * 60 && utcMinutes < 22 * 60) {
      return {
        isOpen: false,
        state: 'CLOSED',
        exchangeName: 'CME / Globex Futures',
        reason: 'Pausa Manutenzione Giornaliera CME (21:00 - 22:00 UTC)',
      };
    }
    return {
      isOpen: true,
      state: 'REGULAR',
      exchangeName: 'CME / Globex Futures',
      reason: 'Mercato Futures Aperto (Sessione Continua)',
    };
  }

  // 3B. Forex (e.g. EURUSD, GBPUSD, etc.)
  if (sym.includes('=X') || isForexPair(sym)) {
    // Friday close at 21:00 UTC
    if (day === 5 && utcMinutes >= 21 * 60) {
      return {
        isOpen: false,
        state: 'WEEKEND',
        exchangeName: 'Interbank Forex',
        reason: 'Mercato Forex Chiuso per il weekend (Chiusura Venerdì 21:00 UTC)',
      };
    }
    return {
      isOpen: true,
      state: 'REGULAR',
      exchangeName: 'Interbank Forex',
      reason: 'Mercato Forex Globale Aperto',
    };
  }

  // 3C. European / Italian Stocks & ETFs (.MI, .DE, .PA, .MC, .AS, .L, etc.)
  if (
    sym.endsWith('.MI') ||
    sym.endsWith('.DE') ||
    sym.endsWith('.PA') ||
    sym.endsWith('.MC') ||
    sym.endsWith('.AS') ||
    sym.endsWith('.L')
  ) {
    if (utcMinutes < 7 * 60 || utcMinutes >= 16 * 60 + 30) {
      return {
        isOpen: false,
        state: 'CLOSED',
        exchangeName: getExchangeName(sym),
        reason: 'Mercato Azionario Europeo Chiuso (Orari di Borsa: 09:00 - 17:30 CET)',
      };
    }
    return {
      isOpen: true,
      state: 'REGULAR',
      exchangeName: getExchangeName(sym),
      reason: 'Mercato Europeo Aperto (Orario Regolare)',
    };
  }

  // 3D. US Equities and ETFs (e.g. NVDA, AAPL, MSFT, SPY, QQQ, TLT, TSLA, etc.)
  if (usHoliday && usHoliday.equitiesClosed) {
    return {
      isOpen: false,
      state: 'CLOSED',
      exchangeName: 'Wall Street (NYSE/NASDAQ)',
      reason: `Wall Street Chiusa per Festività USA (${usHoliday.name})`,
      nextOpenNotice: 'Riapertura mercati prevista per la prossima sessione ordinaria',
    };
  }

  // US Regular Trading Hours: 09:30 - 16:00 US Eastern Time (approx 13:30 - 20:00 UTC)
  if (utcMinutes < 13 * 60 + 30 || utcMinutes >= 20 * 60) {
    return {
      isOpen: false,
      state: 'CLOSED',
      exchangeName: 'Wall Street (NYSE/NASDAQ)',
      reason: 'Wall Street Chiusa (Orari Regolari: 09:30 - 16:00 ET / 15:30 - 22:00 CET)',
    };
  }

  return {
    isOpen: true,
    state: 'REGULAR',
    exchangeName: 'Wall Street (NYSE/NASDAQ)',
    reason: 'Borsa USA Aperta (Sessione Regolare)',
  };
}

function isForexPair(ticker: string): boolean {
  const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'EURGBP', 'EURCHF', 'EURJPY', 'USDCAD', 'USDCHF', 'NZDUSD'];
  return PAIRS.includes(ticker);
}

export function getExchangeName(sym: string): string {
  if (sym.endsWith('.MI')) return 'Borsa Italiana (MTA)';
  if (sym.endsWith('.DE')) return 'Xetra Francoforte';
  if (sym.endsWith('.PA')) return 'Euronext Parigi';
  if (sym.includes('=F')) return 'CME / Globex Futures';
  if (sym.includes('=X') || isForexPair(sym)) return 'Mercato Valutario FX';
  return 'Wall Street (NYSE/NASDAQ)';
}
