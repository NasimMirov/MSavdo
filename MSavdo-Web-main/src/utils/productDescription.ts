export const ORDER_DELIVERY_NOTICE = 'Доставка 12–35 дней!';
export const COLOR_IMAGE_SPEC_PREFIX = 'Фото цвета: ';
const PRODUCT_COLOR_SPEC_PATTERN = /^(?:доступные\s+цвета|цвет(?:а)?|цвет\s+товара|color(?:\s+classification)?|colou?r(?:\s+classification)?|颜色(?:分类)?|顏色)$/i;
const PRODUCT_COLOR_LIST_SEPARATOR = /[,，、;；|\n/]+/;

export function normalizeProductColor(color: string): string {
  return cleanProductDescription(color)
    .replace(/^(?:цвет|color|colour)\s*[:：-]\s*/i, '')
    .replace(/[.:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru');
}

export function removeProductColor(
  specifications: Array<{ name: string; value: string }>,
  description: string,
  color: string,
): { specifications: Array<{ name: string; value: string }>; description: string } {
  const normalizedColor = normalizeProductColor(color);
  if (!normalizedColor) return { specifications, description };

  const remainingSpecifications = specifications.flatMap((spec) => {
    const colorImageMatch = spec.name.match(/^Фото цвета:\s*(.+)$/i);
    if (colorImageMatch && normalizeProductColor(colorImageMatch[1]) === normalizedColor) return [];
    if (!isProductColorSpecification(spec.name)) return [spec];

    const remainingColors = spec.value
      .split(PRODUCT_COLOR_LIST_SEPARATOR)
      .map((value) => value.trim())
      .filter((value) => value && normalizeProductColor(value) !== normalizedColor);
    return remainingColors.length ? [{ ...spec, value: remainingColors.join(', ') }] : [];
  });

  const remainingDescription = description
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^(\s*(?:[•*-]\s*)?(?:доступные\s+цвета|цвет(?:а)?|colou?r)\s*[:：]\s*)(.+)$/i);
      if (!match) return [line];
      const remainingColors = match[2]
        .split(PRODUCT_COLOR_LIST_SEPARATOR)
        .map((value) => value.trim())
        .filter((value) => value && normalizeProductColor(value) !== normalizedColor);
      return remainingColors.length ? [`${match[1]}${remainingColors.join(', ')}`] : [];
    })
    .join('\n');

  return { specifications: remainingSpecifications, description: remainingDescription };
}

export function isProductColorSpecification(name: string): boolean {
  return PRODUCT_COLOR_SPEC_PATTERN.test(name.trim());
}

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
    .filter((spec) => isProductColorSpecification(spec.name))
    .map((spec) => spec.value);
  const descriptionColors = Array.from(
    description.matchAll(/(?:^|\n)\s*(?:[•*-]\s*)?(?:доступные\s+цвета|цвет(?:а)?|colou?r)\s*[:：]\s*([^\n]+)/gi),
    (match) => match[1],
  );
  const colors = new Map<string, string>();

  for (const value of [...colorValues, ...descriptionColors]) {
    for (const rawColor of value.split(PRODUCT_COLOR_LIST_SEPARATOR)) {
      const color = cleanProductDescription(rawColor)
        .replace(/^(?:цвет|color|colour)\s*[:：-]\s*/i, '')
        .replace(/[.:]+$/g, '')
        .trim();
      if (
        color
        && color.length <= 48
        && !/^(?:цвет|цвета|color|colour|standard|стандарт)$/i.test(color)
        && !/[\u3400-\u9fff]/.test(color)
      ) {
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

export function removeOrderDeliveryNotice(description: string): string {
  return description.replace(
    /^\s*(?:Доставка\s+(?:(?:18\s*[-–—]\s*(?:20|30))|(?:12\s*[-–—]\s*35)|до\s*30)\s+дней!?\s*)+/i,
    '',
  ).trim();
}

export function ensureOrderDeliveryNotice(description: string): string {
  const cleanBody = cleanProductDescription(removeOrderDeliveryNotice(description));
  return cleanBody ? `${ORDER_DELIVERY_NOTICE}\n\n${cleanBody}` : ORDER_DELIVERY_NOTICE;
}
