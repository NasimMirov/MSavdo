import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react';
import { Product } from '../types';
import { copyProductLink, getProductUrl, shareProduct } from '../utils/productSharing';
import { useI18n } from '../i18n';

interface ProductShareButtonProps {
  product: Product;
  className?: string;
  menuAlignment?: 'left' | 'right';
}

export const ProductShareButton: React.FC<ProductShareButtonProps> = ({
  product,
  className = '',
  menuAlignment = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isOpen]);

  const handleOtherShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setShareError(false);
    try {
      const result = await shareProduct(product);
      if (result === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      } else {
        setIsOpen(false);
      }
    } catch (error) {
      console.error('[Product Share]', error);
      setShareError(true);
    }
  };

  const handleCopyLink = async () => {
    setShareError(false);
    try {
      await copyProductLink(product);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      console.error('[Product Share] Could not copy link:', error);
      setShareError(true);
    }
  };

  const productUrl = getProductUrl(product);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${product.title}\n${productUrl}`)}`;
  const wrapperPosition = className.split(/\s+/).includes('absolute') ? '' : 'relative';

  return (
    <div
      ref={containerRef}
      className={`${wrapperPosition} ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => { setShareError(false); setIsOpen((open) => !open); }}
        aria-label={t('shareProduct')}
        aria-expanded={isOpen}
        title={t('shareProduct')}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition hover:bg-amber-400 hover:text-slate-950 active:scale-95"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
      </button>
      {isOpen && (
        <div className={`absolute ${menuAlignment === 'right' ? 'right-0' : 'left-0'} top-full z-[60] mt-1.5 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl`}>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            {t('shareWhatsApp')}
          </a>
          <button
            type="button"
            onClick={handleOtherShare}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
            {t('shareOther')}
          </button>
          <button type="button" onClick={() => void handleCopyLink()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? t('linkCopied') : t('copyLink')}
          </button>
          {shareError && (
            <div role="alert" className="max-w-64 px-3 py-2 text-xs text-red-700">
              <p>{t('shareError')}</p>
              <input aria-label={t('copyLink')} readOnly value={productUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 w-full rounded border border-slate-300 p-1 text-slate-800" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
