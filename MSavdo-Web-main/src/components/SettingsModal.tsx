import React, { useEffect, useRef, useState } from 'react';
import { Moon, Sun, X } from 'lucide-react';
import { apiFetch } from '../api';
import { useI18n } from '../i18n';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { language, setLanguage, theme, toggleTheme, t } = useI18n();
  const [productWish, setProductWish] = useState('');
  const [suggestion, setSuggestion] = useState('');
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!productWish.trim() && !suggestion.trim()) {
      setStatus('required');
      return;
    }
    setSending(true);
    setStatus(null);
    try {
      const response = await apiFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_wish: productWish.trim(), suggestion: suggestion.trim() }),
      });
      if (!response.ok) throw new Error(`Feedback request failed: ${response.status}`);
      setProductWish('');
      setSuggestion('');
      setStatus('success');
    } catch (error) {
      console.error('[Feedback]', error);
      setStatus('error');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={onClose}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-bold">{t('settingsTitle')}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('close')}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm font-semibold">
            <span className="block">{t('language')}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="w-full rounded-xl border border-slate-300 bg-white p-2 text-sm">
              <option value="ru">Русский</option><option value="tg">Тоҷикӣ</option><option value="en">English</option>
            </select>
          </label>
          <div className="space-y-1 text-sm font-semibold">
            <span className="block">{t('appearance')}</span>
            <button type="button" onClick={toggleTheme} className="flex w-full items-center gap-2 rounded-xl border border-slate-300 p-2 text-sm">
              {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === 'light' ? t('lightTheme') : t('darkTheme')}
            </button>
          </div>
        </div>
        <form onSubmit={submit} className="mt-5 space-y-3 border-t border-slate-200 pt-4">
          <label className="block text-sm font-semibold">
            {t('productWish')}
            <textarea disabled={sending} value={productWish} onChange={(event) => setProductWish(event.target.value)} maxLength={2000}
              rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" />
          </label>
          <label className="block text-sm font-semibold">
            {t('projectSuggestion')}
            <textarea disabled={sending} value={suggestion} onChange={(event) => setSuggestion(event.target.value)} maxLength={2000}
              rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-2 text-sm font-normal" />
          </label>
          <p className="text-xs text-slate-500">{t('feedbackHint')}</p>
          {status && <p role="status" className={`text-sm ${status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
            {t(status === 'success' ? 'feedbackSuccess' : status === 'required' ? 'feedbackRequired' : 'feedbackError')}
          </p>}
          <button type="submit" disabled={sending} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {sending ? t('feedbackSending') : t('feedbackSend')}
          </button>
        </form>
      </section>
    </div>
  );
}
