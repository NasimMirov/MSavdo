export interface Promotion {
  id: number;
  title: string;
  kind: 'discount' | 'quantity' | 'bundle' | 'banner';
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  scope: 'order' | 'products' | 'categories';
  product_ids: number[];
  category_ids: number[];
  min_quantity: number;
  min_total: number;
  code: string;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  uses: number;
  stackable: boolean;
  priority: number;
  active: boolean;
}

export interface PromotionItem {
  product_id: number;
  category_id: number | null;
  quantity: number;
  price_tjs: number;
}

export interface PromotionResult {
  subtotal: number;
  discount: number;
  total: number;
  applied: Array<{ id: number; title: string; amount: number; code: string }>;
  code_applied: boolean;
}

export function calculatePromotions(items: PromotionItem[], promotions: Promotion[], code: string, now: Date): PromotionResult {
  const amounts = items.map((item) => item.quantity * item.price_tjs);
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  const normalizedCode = code.trim().toUpperCase();
  const applied: PromotionResult['applied'] = [];
  let exclusive = false;
  const candidates = promotions.slice().sort((a, b) => b.priority - a.priority || a.id - b.id);
  for (const promotion of candidates) {
    if (!promotion.active || promotion.kind === 'banner' ||
        (promotion.starts_at && now.getTime() < Date.parse(promotion.starts_at)) ||
        (promotion.ends_at && now.getTime() >= Date.parse(promotion.ends_at)) ||
        (promotion.max_uses !== null && promotion.uses >= promotion.max_uses) ||
        (promotion.code && promotion.code !== normalizedCode) ||
        subtotal < promotion.min_total || exclusive || (!promotion.stackable && applied.length > 0)) continue;

    const matchesTarget = (item: PromotionItem) =>
      promotion.scope === 'order' ||
      (promotion.scope === 'products' && promotion.product_ids.includes(item.product_id)) ||
      (promotion.scope === 'categories' && item.category_id !== null && promotion.category_ids.includes(item.category_id));
    if (promotion.kind === 'bundle' && (promotion.product_ids.length < 2 || !promotion.product_ids.every((id) => items.some((item) => item.product_id === id)))) continue;
    if (promotion.kind === 'quantity') {
      const quantities = new Map<number, number>();
      for (const item of items) {
        if (matchesTarget(item)) quantities.set(item.product_id, (quantities.get(item.product_id) || 0) + item.quantity);
      }
      if (![...quantities.values()].some((quantity) => quantity >= promotion.min_quantity)) continue;
    }

    const indices = items.map((item, index) => {
      if (promotion.kind === 'bundle' && promotion.scope !== 'order') {
        return promotion.product_ids.includes(item.product_id) ? index : -1;
      }
      if (promotion.kind === 'quantity') {
        const quantity = items.filter((candidate) => candidate.product_id === item.product_id)
          .reduce((sum, candidate) => sum + candidate.quantity, 0);
        return matchesTarget(item) && quantity >= promotion.min_quantity ? index : -1;
      }
      return matchesTarget(item) ? index : -1;
    }).filter((index) => index >= 0);
    const eligible = indices.reduce((sum, index) => sum + amounts[index], 0);
    if (eligible <= 0) continue;
    const requested = promotion.discount_type === 'percent'
      ? Math.round(eligible * promotion.discount_value / 100)
      : promotion.discount_value;
    const discount = Math.min(eligible, requested);
    if (discount <= 0) continue;

    let remainingDiscount = discount;
    let remainingEligible = eligible;
    for (const index of indices) {
      const amount = amounts[index];
      if (amount === 0) continue;
      const reduction = remainingEligible === amount
        ? remainingDiscount
        : Math.min(amount, Math.floor(remainingDiscount * amount / remainingEligible));
      amounts[index] -= reduction;
      remainingDiscount -= reduction;
      remainingEligible -= amount;
    }
    applied.push({ id: promotion.id, title: promotion.title, amount: discount, code: promotion.code });
    if (!promotion.stackable) exclusive = true;
  }
  const discount = applied.reduce((sum, item) => sum + item.amount, 0);
  return { subtotal, discount, total: subtotal - discount, applied, code_applied: Boolean(normalizedCode && applied.some((item) => item.code === normalizedCode)) };
}
