import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('QuantLab Uncaught Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleResetCache = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center p-6 font-sans">
          <div className="max-w-xl w-full bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="w-11 h-11 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">
                  Errore di Inizializzazione QuantLab
                </h1>
                <p className="text-xs text-slate-500">
                  Si è verificata un&apos;anomalia nel caricamento dei dati di sessione
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-rose-700 overflow-x-auto">
              {this.state.error?.toString() || 'Errore sconosciuto'}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex-1 py-2.5 px-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Ricarica Applicazione
              </button>

              <button
                type="button"
                onClick={this.handleResetCache}
                className="flex-1 py-2.5 px-4 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm flex items-center justify-center gap-2 border border-slate-300 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                Svuota Cache Locale
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
