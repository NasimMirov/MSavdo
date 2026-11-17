export const ORDER_DELIVERY_NOTICE = 'Доставка 12–35 дней!';
export const BILINGUAL_ORDER_NOTICE_RU = 'Нет в наличии. Доставка занимает 15–35 дней. Возможна доставка до дома в городах Душанбе, Бохтар (Курган-Тюбе) и Левакант. В другие города Таджикистана отправляем.';
export const BILINGUAL_ORDER_NOTICE_TJ = 'Дар анбор мавҷуд нест. Мӯҳлати расонидан 15–35 рӯз аст. Имкони расонидан то хона дар шаҳрҳои Душанбе, Бохтар (Қӯрғонтеппа) ва Левакант мавҷуд аст. Ба дигар шаҳрҳои Тоҷикистон низ мефиристем.';
export const BILINGUAL_ORDER_NOTICE = `${BILINGUAL_ORDER_NOTICE_RU}\n\n${BILINGUAL_ORDER_NOTICE_TJ}`;
export const BILINGUAL_STOCK_NOTICE = 'В наличии. Возможна доставка до дома в городах Душанбе, Бохтар (Курган-Тюбе) и Левакант. В другие города Таджикистана отправляем.\n\nДар анбор мавҷуд аст. Имкони расонидан то хона дар шаҳрҳои Душанбе, Бохтар (Қӯрғонтеппа) ва Левакант мавҷуд аст. Ба дигар шаҳрҳои Тоҷикистон низ мефиристем.';
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
  const bilingualClean = removeBilingualOrderNotice(description);
  return bilingualClean.replace(
    /^\s*(?:Доставка\s+(?:(?:18\s*[-–—]\s*(?:20|30))|(?:12\s*[-–—]\s*35)|до\s*30)\s+дней!?\s*)+/i,
    '',
  ).trim();
}

export function ensureOrderDeliveryNotice(description: string): string {
  const cleanBody = cleanProductDescription(removeOrderDeliveryNotice(description));
  return cleanBody ? `${ORDER_DELIVERY_NOTICE}\n\n${cleanBody}` : ORDER_DELIVERY_NOTICE;
}

export function removeBilingualOrderNotice(description: string): string {
  const trimmed = description.trim();
  if (trimmed.startsWith(BILINGUAL_ORDER_NOTICE)) {
    return trimmed.slice(BILINGUAL_ORDER_NOTICE.length).trim();
  }
  if (trimmed.startsWith(BILINGUAL_ORDER_NOTICE_RU)) {
    return trimmed.slice(BILINGUAL_ORDER_NOTICE_RU.length).trim();
  }
  if (trimmed.startsWith(BILINGUAL_ORDER_NOTICE_TJ)) {
    return trimmed.slice(BILINGUAL_ORDER_NOTICE_TJ.length).trim();
  }
  if (trimmed.startsWith(BILINGUAL_STOCK_NOTICE)) {
    return trimmed.slice(BILINGUAL_STOCK_NOTICE.length).trim();
  }
  return trimmed;
}

export function ensureBilingualOrderNotice(description: string): string {
  return buildBilingualProductDescription(description);
}

const TAJIK_SPEC_LABELS: Record<string, string> = {
  'цвет': 'Ранг', 'материал': 'Мавод', 'размер': 'Андоза', 'вес': 'Вазн', 'мощность': 'Қувва',
  'напряжение': 'Шиддат', 'объём памяти': 'Ҳаҷми хотира', 'объем памяти': 'Ҳаҷми хотира',
  'память': 'Хотира', 'совместимость': 'Мутобиқат', 'комплектация': 'Маҷмӯа',
};

const TAJIK_TITLE_TERMS: Array<[RegExp, string]> = [
  [/смартфон|смарт телефон/gi, 'телефони ҳушманд'],
  [/мобильный телефон|телефон/gi, 'телефон'],
  [/умные очки|смарт-очки/gi, 'айнаки ҳушманд'], [/очки/gi, 'айнак'],
  [/наушники|гарнитура/gi, 'гӯшмонак'], [/беспроводные/gi, 'бесим'],
  [/смарт[- ]?часы|умные часы/gi, 'соати ҳушманд'], [/часы/gi, 'соат'],
  [/кроссовки|кеды/gi, 'пойафзоли варзишӣ'], [/обувь|ботинки/gi, 'пойафзол'],
  [/платье/gi, 'либос'], [/лампа|светильник/gi, 'чароғ'],
  [/камера|фотоаппарат/gi, 'камера'], [/зарядное устройство|зарядка|зарядное/gi, 'пуркунандаи барқ'],
  [/портативный аккумулятор|внешний аккумулятор|пауэрбанк/gi, 'батареяи сайёр'],
  [/защищённый|защищенный/gi, 'муҳофизатшуда'], [/память/gi, 'хотира'],
  [/экран/gi, 'экран'], [/черный|чёрный/gi, 'сиёҳ'], [/белый/gi, 'сафед'],
  [/красный/gi, 'сурх'], [/синий|голубой/gi, 'кабуд'], [/зелёный|зеленый/gi, 'сабз'],
  [/\bsmart glasses?\b/gi, 'айнаки ҳушманд'],
  [/\bglasses?\b/gi, 'айнак'], [/\bsunglasses?\b/gi, 'айнаки офтобӣ'],
  [/\bheadphones?\b/gi, 'гӯшмонак'], [/\bearbuds?\b/gi, 'гӯшмонак'],
  [/\bphone\b|\bsmartphone\b/gi, 'телефони мобилӣ'], [/\bwatch\b/gi, 'соат'],
  [/\bshoes?\b/gi, 'пойафзол'], [/\bdress\b/gi, 'либос'],
  [/\blamp\b/gi, 'чароғ'], [/\bcamera\b/gi, 'камера'],
  [/\bcharger\b/gi, 'пуркунандаи барқ'], [/\bpower bank\b/gi, 'батареяи сайёр'],
  [/\bblack\b/gi, 'сиёҳ'], [/\bwhite\b/gi, 'сафед'], [/\bred\b/gi, 'сурх'],
  [/\bblue\b/gi, 'кабуд'], [/\bgreen\b/gi, 'сабз'], [/\bnew\b/gi, 'нав'],
];

const TAJIK_DESCRIPTION_TERMS: Array<[string, string]> = [
  ['\u0434\u043b\u044f', '\u0431\u0430\u0440\u043e\u0438'],
  ['\u0441\u043e\u0432\u043c\u0435\u0441\u0442\u0438\u043c\u044b\u0439', '\u043c\u0443\u0442\u043e\u0431\u0438\u049b'],
  ['\u0431\u0435\u0441\u043f\u0440\u043e\u0432\u043e\u0434\u043d\u043e\u0439', '\u0431\u0435\u0441\u0438\u043c'],
  ['\u043b\u0435\u0433\u043a\u0438\u0439', '\u0441\u0430\u0431\u0443\u043a'],
  ['\u043b\u0451\u0433\u043a\u0438\u0439', '\u0441\u0430\u0431\u0443\u043a'],
  ['\u0432\u044b\u0441\u043e\u043a\u043e\u0435', '\u0431\u0430\u043b\u0430\u043d\u0434'],
  ['\u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e', '\u0441\u0438\u0444\u0430\u0442'],
  ['\u043c\u043e\u0436\u043d\u043e', '\u043c\u0443\u043c\u043a\u0438\u043d'],
  ['\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c', '\u0438\u0441\u0442\u0438\u0444\u043e\u0434\u0430\u0431\u0443\u0440\u0434\u0430\u043d'],
  ['\u0432\u0435\u0441', '\u0432\u0430\u0437\u043d'],
  ['\u0440\u0430\u0437\u043c\u0435\u0440', '\u0430\u043d\u0434\u043e\u0437\u0430'],
  ['\u0446\u0432\u0435\u0442', '\u0440\u0430\u043d\u0433'],
  ['\u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b', '\u043c\u0430\u0432\u043e\u0434'],
  ['\u0447\u0435\u0440\u043d\u044b\u0439|\u0447\u0451\u0440\u043d\u044b\u0439', '\u0441\u0438\u0451\u04b3'],
  ['\u0431\u0435\u043b\u044b\u0439', '\u0441\u0430\u0444\u0435\u0434'],
  ['\u0441\u0438\u043d\u0438\u0439', '\u043a\u0430\u0431\u0443\u0434'],
  ['\u043a\u0440\u0430\u0441\u043d\u044b\u0439', '\u0441\u0443\u0440\u0445'],
  ['\u0437\u0435\u043b\u0451\u043d\u044b\u0439|\u0437\u0435\u043b\u0435\u043d\u044b\u0439', '\u0441\u0430\u0431\u0437'],
  ['\u043d\u043e\u0432\u044b\u0439', '\u043d\u0430\u0432'],
];

function translateKnownProductTerms(text: string): string {
  const titleTranslated = TAJIK_TITLE_TERMS.reduce((translated, [pattern, value]) => translated.replace(pattern, value), text);
  return TAJIK_DESCRIPTION_TERMS.reduce((translated, [source, value]) => {
    const pattern = new RegExp(`\\b(?:${source})\\b`, 'gi');
    return translated.replace(pattern, value);
  }, titleTranslated);
}

export function buildBilingualProductDescription(
  description: string,
  title = '',
  specifications: Array<{ name: string; value: string }> = [],
  deliveryType: 'stock' | 'order' = 'order',
): string {
  const cleanBody = cleanProductDescription(removeOrderDeliveryNotice(description)
    .replace(/\n?Ключевые слова для поиска:[\s\S]*$/i, ''));
  const facts = specifications
    .filter((spec) => spec && typeof spec.name === 'string' && typeof spec.value === 'string')
    .map((spec) => {
      const name = spec.name.trim();
      const value = spec.value.trim();
      if (!name || !value || /^фото цвета:/i.test(name)) return '';
      return `${TAJIK_SPEC_LABELS[name.toLocaleLowerCase('ru')] || translateKnownProductTerms(name)}: ${translateKnownProductTerms(value)}`;
    })
    .filter(Boolean)
    .slice(0, 8);
  const tajikDescription = [translateKnownProductTerms(title.trim()), ...facts].filter(Boolean).join('. ');
  const bilingualNotice = deliveryType === 'stock' ? BILINGUAL_STOCK_NOTICE : BILINGUAL_ORDER_NOTICE;
  const productSections = [
    cleanBody ? `Описание товара: ${cleanBody}` : '',
    tajikDescription ? `Тавсифи маҳсулот: ${tajikDescription}` : '',
  ].filter(Boolean);
  return [bilingualNotice, ...productSections].join('\n\n');
}
