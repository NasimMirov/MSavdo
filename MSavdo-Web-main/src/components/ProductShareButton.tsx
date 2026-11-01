import React, { useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, Share2 } from 'lucide-react';
import { Product } from '../types';
import { getProductUrl, shareProduct } from '../utils/productSharing';

interface ProductShareButtonProps {
  product: Product;
  className?: string;
}

export const ProductShareButton: React.FC<ProductShareButtonProps> = ({ product, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  const handleOtherShare = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
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
    }
  };

  const productUrl = getProductUrl(product);
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${product.title}\n${productUrl}`)}`;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Поделиться товаром"
        aria-expanded={isOpen}
        title="Поделиться"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition hover:bg-amber-400 hover:text-slate-950 active:scale-95"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-[60] mt-1.5 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700"
          >
            <MessageCircle className="h-4 w-4" />
            Поделиться в WhatsApp
          </a>
          <button
            type="button"
            onClick={handleOtherShare}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
            {copied ? 'Ссылка скопирована' : 'Другие приложения'}
          </button>
        </div>
      )}
    </div>
  );
};
