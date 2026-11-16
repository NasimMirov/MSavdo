import { Product } from '../types';

export type ShareResult = 'shared' | 'copied' | 'cancelled';

export function getProductUrl(product: Product): string {
  // Shared links must open the SPA so users get the interactive product card.
  // The /product/:id/:slug route is reserved for SEO crawler pages.
  const url = new URL('/', window.location.origin);
  url.searchParams.set('product', String(product.id));
  return url.toString();
}

function copyTextFallback(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  let copied: boolean;
  try {
    textarea.select();
    copied = document.execCommand('copy');
  } finally {
    textarea.remove();
  }
  if (!copied) throw new Error('Не удалось скопировать ссылку на товар');
}

export async function copyProductLink(product: Product): Promise<void> {
  const url = getProductUrl(product);
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return;
    } catch (error) {
      console.warn('[Product Share] Clipboard API unavailable, trying fallback:', error);
    }
  }
  copyTextFallback(url);
}

export async function shareProduct(product: Product): Promise<ShareResult> {
  const url = getProductUrl(product);
  if (navigator.share) {
    try {
      await navigator.share({ title: product.title, url });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      throw error;
    }
  }

  await copyProductLink(product);
  return 'copied';
}
