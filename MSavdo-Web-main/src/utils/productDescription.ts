export const ORDER_DELIVERY_NOTICE = 'Доставка 18-30 дней!';

export function ensureOrderDeliveryNotice(description: string): string {
  const body = description
    .replace(/^\s*(?:Доставка\s+(?:(?:18\s*[-–—]\s*(?:20|30))|до\s*30)\s+дней!?\s*)+/i, '')
    .trim();

  return body ? `${ORDER_DELIVERY_NOTICE}\n\n${body}` : ORDER_DELIVERY_NOTICE;
}
