/**
 * QuantLab - Client API wrapper for Autonomous AI Portfolio Manager & Live Web Briefings
 * Uses verified Firebase ID token Authorization headers on all mutating endpoints.
 */
import {
  AiAutopilotConfig,
  AiAutopilotState,
  AiDecisionRecord,
  AiMarketBriefing,
} from '../types/aiAutopilot';
import { authenticatedFetch } from './authClient';

export async function fetchAiAutopilotState(refreshSnapshot = false): Promise<AiAutopilotState> {
  const url = refreshSnapshot ? '/api/ai/state?refreshSnapshot=true' : '/api/ai/state';
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return await res.json();
}

export async function runAiAutopilotCycle(refreshWeb = true): Promise<{
  briefing: AiMarketBriefing;
  decisions: AiDecisionRecord[];
  executedActionsCount: number;
  session: any;
  state: AiAutopilotState;
}> {
  const res = await authenticatedFetch('/api/ai/autopilot/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshWeb }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Errore ciclo AI (HTTP ${res.status})`);
  }
  return data;
}

export async function updateAiAutopilotConfig(
  partial: Partial<AiAutopilotConfig>
): Promise<AiAutopilotConfig> {
  const res = await authenticatedFetch('/api/ai/autopilot/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Errore salvataggio configurazione (HTTP ${res.status})`);
  }
  return data.config;
}

export async function refreshAiWebBriefing(): Promise<{
  briefing: AiMarketBriefing;
  state: AiAutopilotState;
}> {
  const res = await authenticatedFetch('/api/ai/briefing/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Errore aggiornamento notizie mercati (HTTP ${res.status})`);
  }
  return data;
}

export async function executeManualVerifiedTrade(params: {
  ticker: string;
  stopLossPct: number;
  takeProfitPct: number;
  allocationEur?: number;
}): Promise<{ ok: boolean; message: string }> {
  const res = await authenticatedFetch('/api/ai/execute-manual-trade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ordine non eseguito (HTTP ${res.status})`);
  }
  return data;
}
