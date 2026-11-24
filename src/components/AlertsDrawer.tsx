/**
 * QuantLab - Step 17: Alerts & Notification Center Drawer
 */
import React from 'react';
import {
  X,
  Bell,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Activity,
  Check,
} from 'lucide-react';
import { AlertNotification, PaperTradingSession } from '../types';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: PaperTradingSession[];
}

export const AlertsDrawer: React.FC<AlertsDrawerProps> = ({
  isOpen,
  onClose,
  sessions,
}) => {
  if (!isOpen) return null;

  // Flatten and sort alerts from all sessions
  const allAlerts: { session: PaperTradingSession; alert: AlertNotification }[] = [];
  for (const s of sessions) {
    for (const a of s.alerts) {
      allAlerts.push({ session: s, alert: a });
    }
  }

  allAlerts.sort((a, b) => b.alert.timestamp - a.alert.timestamp);

  const handleMarkRead = (sessionId: string, alertId: string) => {
    globalPaperTradingEngine.markAlertAsRead(sessionId, alertId);
  };

  const handleMarkAllRead = () => {
    for (const item of allAlerts) {
      if (!item.alert.read) {
        globalPaperTradingEngine.markAlertAsRead(item.session.id, item.alert.id);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-md h-full flex flex-col shadow-2xl animate-slideLeft">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Centro Notifiche & Alert</h3>
              <p className="text-xs text-slate-400">Eventi eseguiti dal motore di Paper Trading</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {allAlerts.some((a) => !a.alert.read) && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
              >
                Segna tutti letti
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {allAlerts.map(({ session, alert }) => {
            const isTP = alert.type === 'TAKE_PROFIT';
            const isSL = alert.type === 'STOP_LOSS';
            const isOrder = alert.type === 'ORDER_OPENED' || alert.type === 'ORDER_CLOSED';

            return (
              <div
                key={alert.id}
                onClick={() => handleMarkRead(session.id, alert.id)}
                className={`p-3.5 rounded-xl border text-xs transition-all cursor-pointer relative ${
                  !alert.read
                    ? 'bg-slate-950 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-950/50 border-slate-800/80 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isTP ? (
                      <span className="p-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    ) : isSL ? (
                      <span className="p-1 rounded bg-rose-950 text-rose-400 border border-rose-800">
                        <ArrowDownRight className="w-3.5 h-3.5" />
                      </span>
                    ) : isOrder ? (
                      <span className="p-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                        <Activity className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="p-1 rounded bg-slate-800 text-slate-400">
                        <Bell className="w-3.5 h-3.5" />
                      </span>
                    )}

                    <span className="font-bold text-white text-xs">{alert.title}</span>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono">{alert.timeStr}</span>
                </div>

                <p className="text-slate-300 mt-1.5 leading-relaxed">{alert.message}</p>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-900 pt-1.5">
                  <div>
                    <strong className="text-slate-200 font-medium">{session.instrument.name || alert.symbol || session.instrument.ticker}</strong>
                    <span className="font-mono text-cyan-400 font-bold ml-1.5">({alert.symbol || session.instrument.ticker})</span>
                    <span className="mx-1.5 text-slate-600">&bull;</span>
                    <span className="text-slate-400">{alert.strategyName || session.strategyName}</span>
                  </div>
                  {!alert.read && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 ml-2" />
                  )}
                </div>
              </div>
            );
          })}

          {allAlerts.length === 0 && (
            <div className="text-center py-16 text-slate-500 text-xs">
              Nessun alert generato finora.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
