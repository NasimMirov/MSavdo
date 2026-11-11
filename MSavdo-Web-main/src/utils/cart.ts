import type { CartItem } from '../types';

export const MAX_CART_QUANTITY = 10000;
export const MAX_CART_LINES = 200;

export function sameCartVariant(a: CartItem, b: CartItem): boolean {
  return a.product_id === b.product_id && (
    a.variant_id != null && b.variant_id != null
      ? a.variant_id === b.variant_id
      : a.variant_id == null && b.variant_id == null && a.variant_sku === b.variant_sku
  );
}

export function mergeCartItems(items: CartItem[]): CartItem[] {
  return items.reduce<CartItem[]>((merged, item) => {
    const index = merged.findIndex((existing) => sameCartVariant(existing, item));
    if (index < 0) merged.push({ ...item });
    else merged[index] = { ...merged[index], quantity: merged[index].quantity + item.quantity };
    return merged;
  }, []);
}

export function addCartItem(items: CartItem[], next: CartItem): CartItem[] | null {
  const existing = items.find((item) => sameCartVariant(item, next));
  if ((existing?.quantity || 0) + next.quantity > MAX_CART_QUANTITY ||
      (!existing && items.length >= MAX_CART_LINES)) return null;
  return mergeCartItems([...items, next]);
}
