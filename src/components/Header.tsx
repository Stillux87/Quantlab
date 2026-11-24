/**
 * QuantLab - High-Contrast Deep Navy Top Navigation Bar (Strict 3-Zone Contract)
 * Anchors the daylight interface with crisp visual separation, vivid active indicators,
 * and integrated Firebase Google Authentication controls.
 */
import React from 'react';
import { RefreshCw, LogIn, LogOut } from 'lucide-react';
import type { AuthUserProfile } from '../services/authClient';

export type ActiveTab =
  | 'home'
  | 'paper'
  | 'markets'
  | 'updates'
  | 'detail'
  | 'scanner'
  | 'search'
  | 'optimizer'
  | 'titan'
  | 'discovery'
  | 'strategies'
  | 'portfolio'
  | 'intelligence'
  | 'leaderboard'
  | 'comparison'
  | 'multi'
  | 'diagnostics'
  | 'robustness';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isRunningAiCycle: boolean;
  onRunAiCycle: () => void;
  authUser: AuthUserProfile | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'home', label: 'Panoramica' },
  { id: 'paper', label: 'Portafoglio AI' },
  { id: 'markets', label: 'Mercati e Grafici' },
  { id: 'updates', label: 'Aggiornamenti AI' },
  { id: 'detail', label: 'Backtest' },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  isRunningAiCycle,
  onRunAiCycle,
  authUser,
  onSignIn,
  onSignOut,
}) => {
  const normalizedTab: ActiveTab =
    activeTab === 'scanner'
      ? 'markets'
      : activeTab === 'portfolio' || activeTab === 'multi'
      ? 'paper'
      : activeTab === 'intelligence'
      ? 'updates'
      : activeTab === 'strategies' || activeTab === 'leaderboard' || activeTab === 'search'
      ? 'detail'
      : activeTab;

  return (
    <header className="sticky top-0 z-40 bg-[#0F172A] border-b border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 sm:gap-8 h-16">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="text-lg font-extrabold tracking-tight text-white hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded"
          >
            Quant<span className="text-sky-400">Lab</span>
          </button>

          {/* Zone 2: 5 clean single-line navigation links */}
          <nav aria-label="Navigazione principale" className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = normalizedTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}-btn`}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:text-sky-300 ${
                    isActive
                      ? 'text-sky-300 font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute left-0 right-0 bottom-0 h-[3px] bg-sky-400 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Auth Control + Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            {authUser ? (
              <button
                id="header-signout-btn"
                type="button"
                onClick={onSignOut}
                title={`Connesso come ${authUser.email || authUser.displayName || 'Utente'}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="max-w-[110px] truncate">
                  {authUser.displayName?.split(' ')[0] || authUser.email?.split('@')[0] || 'Account'}
                </span>
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
              </button>
            ) : (
              <button
                id="header-signin-btn"
                type="button"
                onClick={onSignIn}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span>Accedi</span>
              </button>
            )}

            <button
              id="header-run-ai-btn"
              type="button"
              onClick={onRunAiCycle}
              disabled={isRunningAiCycle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white text-sm font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              {isRunningAiCycle && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isRunningAiCycle ? 'Analisi AI...' : 'Esegui Ciclo AI'}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
