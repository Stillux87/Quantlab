/**
 * QuantLab - Mobile Bottom Navigation Bar (High-Contrast Navy Dock)
 */
import React from 'react';
import { Home, Briefcase, LineChart, Newspaper, BarChart2 } from 'lucide-react';
import { ActiveTab } from './Header';

interface BottomNavProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, setActiveTab }) => {
  const items: Array<{ id: ActiveTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'paper', label: 'Portafoglio', icon: Briefcase },
    { id: 'markets', label: 'Mercati', icon: LineChart },
    { id: 'updates', label: 'News AI', icon: Newspaper },
    { id: 'detail', label: 'Backtest', icon: BarChart2 },
  ];

  return (
    <nav
      aria-label="Navigazione mobile"
      className="fixed bottom-0 left-0 right-0 z-30 bg-[#0F172A] border-t border-slate-800 px-2 py-1.5 md:hidden shadow-lg"
    >
      <div className="max-w-md mx-auto flex items-center justify-between">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 min-h-[44px] rounded-md transition-colors cursor-pointer ${
                isActive ? 'text-sky-300 font-semibold bg-slate-800/80' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="text-[11px] whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
