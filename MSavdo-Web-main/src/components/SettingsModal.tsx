import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, ChevronRight, LifeBuoy, Menu, MessageSquare, Moon, PackagePlus, Send, Sun, Video, X } from 'lucide-react';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (destination: 'rules' | 'faq' | 'video') => void;
}

type FeedbackMode = 'suggestion' | 'product' | 'error';

export function SettingsModal({ isOpen, onClose, onNavigate }: SettingsModalProps) {
  const { language, setLanguage, theme, setTheme, t } = useI18n();
  const [productWish, setProductWish] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [errorReport, setErrorReport] = useState('');
  const [feedbackMode, setFeedbackMode] = useState<FeedbackMode>('suggestion');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<'success' | 'error' | 'required' | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  const setMode = (mode: FeedbackMode) => {
    setFeedbackMode(mode);
    setStatus(null);
  };

  const valueForMode = feedbackMode === 'suggestion' ? suggestion : feedbackMode === 'product' ? productWish : errorReport;
  const setValueForMode = (value: string) => {
    if (feedbackMode === 'suggestion') setSuggestion(value);
    else if (feedbackMode === 'product') setProductWish(value);
    else setErrorReport(value);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valueForMode.trim()) {
      setStatus('required');
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const response = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_wish: productWish.trim(),
          suggestion: suggestion.trim(),
          error_report: errorReport.trim(),
        }),
      });
      if (!response.ok) throw new Error(`Feedback request failed: ${response.status}`);
      setProductWish('');
      setSuggestion('');
      setErrorReport('');
      setStatus('success');
    } catch (error) {
      console.error('[Feedback]', error);
      setStatus('error');
    } finally {
      setSending(false);
    }
  };

  const feedbackActions: Array<{ mode: FeedbackMode; icon: React.ReactNode; title: string; description: string }> = [
    { mode: 'suggestion', icon: <MessageSquare className="h-4 w-4" />, title: t('menuFeedback'), description: t('projectSuggestion') },
    { mode: 'product', icon: <PackagePlus className="h-4 w-4" />, title: t('menuProductWish'), description: t('productWish') },
    { mode: 'error', icon: <AlertTriangle className="h-4 w-4" />, title: t('errorReport'), description: t('errorReportPlaceholder') },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center overscroll-contain bg-slate-950/65 sm:items-center sm:p-4" onClick={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white text-slate-900 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">M.Savdo</p>
            <h2 id="settings-title" className="text-xl font-extrabold tracking-tight">{t('settingsTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500">{t('feedbackHint')}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')}
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-5">
          <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{t('appearance')}</span>
              <label className="text-xs font-medium text-slate-500">
                <span className="sr-only">{t('language')}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">
                  <option value="ru">Русский</option><option value="tg">Тоҷикӣ</option><option value="en">English</option>
                </select>
              </label>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-white">
              {(['system', 'light', 'dark'] as const).map((option) => (
                <button key={option} type="button" onClick={() => setTheme(option)} aria-pressed={theme === option}
                  className={`flex min-w-0 flex-1 items-center justify-center gap-1 border-l border-slate-200 px-1.5 py-2 text-[11px] font-semibold transition first:border-l-0 ${theme === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {option === 'system' ? <Menu className="h-3.5 w-3.5" /> : option === 'light' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                  <span className="truncate">{option === 'system' ? t('systemTheme') : option === 'light' ? t('lightTheme') : t('darkTheme')}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold">{t('feedbackHint')}</h3>
            </div>
            <div className="divide-y divide-slate-100 border-y border-slate-200">
              {feedbackActions.map((action) => (
                <button key={action.mode} type="button" onClick={() => setMode(action.mode)} aria-pressed={feedbackMode === action.mode}
                  className={`flex min-h-10 w-full items-center gap-2 px-1 text-left text-xs font-medium transition ${feedbackMode === action.mode ? 'text-slate-950' : 'text-slate-600 hover:text-slate-900'}`}>
                  <span className={feedbackMode === action.mode ? 'text-amber-700' : 'text-slate-500'}>{action.icon}</span>
                  <span className="flex-1">{action.title}</span>
                  {feedbackMode === action.mode && <CheckCircle2 className="h-4 w-4 text-amber-700" />}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-3 border-t border-slate-200 pt-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="settings-feedback" className="text-sm font-bold">{feedbackActions.find((action) => action.mode === feedbackMode)?.description}</label>
                <span className="text-[10px] font-semibold text-slate-400">{valueForMode.length}/2000</span>
              </div>
              <textarea id="settings-feedback" disabled={sending} value={valueForMode} onChange={(event) => setValueForMode(event.target.value)} maxLength={2000}
                rows={4} placeholder={feedbackMode === 'error' ? t('errorReportPlaceholder') : undefined}
                className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              {status && <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs font-semibold ${status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {status === 'success' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {t(status === 'success' ? 'feedbackSuccess' : status === 'required' ? 'feedbackRequired' : 'feedbackError')}
              </p>}
              <button type="submit" disabled={sending} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-50">
                <Send className="h-4 w-4" />{sending ? t('feedbackSending') : t('feedbackSend')}
              </button>
            </form>
          </section>

          <nav aria-label={t('settingsTitle')} className="border-t border-slate-200 pt-2">
            {[
              { destination: 'video' as const, icon: <Video className="h-4 w-4" />, label: t('menuVideoFeed') },
              { destination: 'faq' as const, icon: <CircleHelp className="h-4 w-4" />, label: t('menuFaq') },
              { destination: 'rules' as const, icon: <Menu className="h-4 w-4" />, label: t('menuRules') },
            ].map((item) => (
              <button key={item.destination} type="button" onClick={() => onNavigate?.(item.destination)} className="flex min-h-10 w-full items-center gap-3 border-b border-slate-100 px-1 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:bg-slate-100">
                <span className="text-slate-500">{item.icon}</span><span className="flex-1">{item.label}</span><ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            ))}
          </nav>
        </div>
      </section>
    </div>
  );
}
