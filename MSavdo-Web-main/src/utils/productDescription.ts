export const ORDER_DELIVERY_NOTICE = 'Доставка 18-30 дней!';
export const COLOR_IMAGE_SPEC_PREFIX = 'Фото цвета: ';

export function extractProductColorImages(
  specifications: Array<{ name: string; value: string }>,
): Array<{ color: string; imageUrl: string }> {
  return specifications.flatMap((spec) => {
    const match = spec.name.match(/^Фото цвета:\s*(.+)$/i);
    return match && spec.value.trim()
      ? [{ color: match[1].trim(), imageUrl: spec.value.trim() }]
      : [];
  });
}

export function extractProductColors(
  specifications: Array<{ name: string; value: string }>,
  description = '',
): string[] {
  const colorValues = specifications
    .filter((spec) => !/^Фото цвета:/i.test(spec.name) && /цвет|color|colour|颜色|顏色/i.test(spec.name))
    .map((spec) => spec.value);
  const descriptionColors = Array.from(
    description.matchAll(/(?:^|\n)\s*(?:[•*-]\s*)?(?:доступные\s+цвета|цвет(?:а)?|colou?r)\s*[:：]\s*([^\n]+)/gi),
    (match) => match[1],
  );
  const colors = new Map<string, string>();

  for (const value of [...colorValues, ...descriptionColors]) {
    for (const rawColor of value
      .replace(/\[[^\]]*\]|【[^】]*】/g, '')
      .split(/[,，、;；|\n/]+/)) {
      const color = cleanProductDescription(rawColor).replace(/[.:]+$/g, '').trim();
      if (color && !/[\u3400-\u9fff]/.test(color)) {
        colors.set(color.toLocaleLowerCase('ru'), color);
      }
    }
  }

  return Array.from(colors.values());
}

export function cleanProductDescription(description: string): string {
  const seen = new Set<string>();
  const lines = description
    .replace(/[\u3400-\u9fff]/g, ' ')
    .replace(/[，]/g, ',')
    .replace(/[。]/g, '.')
    .replace(/[；]/g, ';')
    .replace(/[：]/g, ':')
    .split(/\r?\n/)
    .map((line) => line
      .replace(/[【】\[\]（）()]/g, ' ')
      .replace(/\s*[|/\\]+\s*/g, ' · ')
      .replace(/(?:\s*·\s*){2,}/g, ' · ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s•·,;:—-]+|[\s•·,;:—-]+$/g, '')
      .trim())
    .filter((line) => /[\p{L}\d]/u.test(line))
    .filter((line) => {
      const key = line.toLocaleLowerCase('ru');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return lines.join('\n');
}

export function ensureOrderDeliveryNotice(description: string): string {
  const body = description
    .replace(/^\s*(?:Доставка\s+(?:(?:18\s*[-–—]\s*(?:20|30))|до\s*30)\s+дней!?\s*)+/i, '')
    .trim();

  const cleanBody = cleanProductDescription(body);
  return cleanBody ? `${ORDER_DELIVERY_NOTICE}\n\n${cleanBody}` : ORDER_DELIVERY_NOTICE;
}
