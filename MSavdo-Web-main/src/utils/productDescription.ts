export const ORDER_DELIVERY_NOTICE = 'Доставка 12–35 дней!';
export const BILINGUAL_ORDER_NOTICE_RU = 'Нет в наличии. Доставка занимает 15–35 дней. Возможна доставка до дома в городах Душанбе, Бохтар (Курган-Тюбе) и Левакант. В другие города Таджикистана отправляем.';
export const BILINGUAL_ORDER_NOTICE_TJ = 'Дар анбор мавҷуд нест. Мӯҳлати расонидан 15–35 рӯз аст. Имкони расонидан то хона дар шаҳрҳои Душанбе, Бохтар (Қӯрғонтеппа) ва Левакант мавҷуд аст. Ба дигар шаҳрҳои Тоҷикистон низ мефиристем.';
export const BILINGUAL_ORDER_NOTICE = `${BILINGUAL_ORDER_NOTICE_TJ}\n\n${BILINGUAL_ORDER_NOTICE_RU}`;
export const BILINGUAL_STOCK_NOTICE = 'Дар анбор мавҷуд аст. Имкони расонидан то хона дар шаҳрҳои Душанбе, Бохтар (Қӯрғонтеппа) ва Левакант мавҷуд аст. Ба дигар шаҳрҳои Тоҷикистон низ мефиристем.\n\nВ наличии. Возможна доставка до дома в городах Душанбе, Бохтар (Курган-Тюбе) и Левакант. В другие города Таджикистана отправляем.';
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
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|section|article)\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/\*([^*]+)\*|_([^_]+)_/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
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

const LEGACY_BILINGUAL_ORDER_NOTICE = `${BILINGUAL_ORDER_NOTICE_RU}\n\n${BILINGUAL_ORDER_NOTICE_TJ}`;
const LEGACY_BILINGUAL_STOCK_NOTICE = 'В наличии. Возможна доставка до дома в городах Душанбе, Бохтар (Курган-Тюбе) и Левакант. В другие города Таджикистана отправляем.\n\nДар анбор мавҷуд аст. Имкони расонидан то хона дар шаҳрҳои Душанбе, Бохтар (Қӯрғонтеппа) ва Левакант мавҷуд аст. Ба дигар шаҳрҳои Тоҷикистон низ мефиристем.';

export function removeBilingualOrderNotice(description: string): string {
  const trimmed = description.trim();
  for (const notice of [BILINGUAL_ORDER_NOTICE, BILINGUAL_STOCK_NOTICE, LEGACY_BILINGUAL_ORDER_NOTICE, LEGACY_BILINGUAL_STOCK_NOTICE, BILINGUAL_ORDER_NOTICE_RU, BILINGUAL_ORDER_NOTICE_TJ]) {
    if (trimmed.startsWith(notice)) return trimmed.slice(notice.length).trim();
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
  [/мужские|мужской/gi, 'мардона'],
  [/женские|женский/gi, 'занона'],
  [/зимние|зимний/gi, 'зимистона'],
  [/летние|летний/gi, 'тобистона'],
  [/беговые|беговой/gi, 'барои давидан'],
  [/повседневные|повседневный/gi, 'рӯзмарра'],
  [/увеличения роста|увеличение роста/gi, 'баландии қад'],
  [/амортизирующей воздушной подушкой/gi, 'бо болишти ҳавоии амортизатсионӣ'],
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
    const pattern = new RegExp(`(?<![\\p{L}])(?:${source})(?![\\p{L}])`, 'giu');
    return translated.replace(pattern, value);
  }, titleTranslated);
}

const PRODUCT_CTA_TJ = 'Барои фармоиш додани ин ва дигар маҳсулоти гуногун ба M.Savdo муроҷиат кунед. Мо маҳсулотро то дари хона дар тамоми Тоҷикистон мерасонем.';
const PRODUCT_CTA_RU = 'Заказывайте этот и другие различные товары в M.Savdo — мы доставляем их до вашего дома по всему Таджикистану.';
const PRODUCT_CTA_MARKER = 'M.Savdo';

const CATEGORY_TAJIK_LABELS: Array<[RegExp, string]> = [
  [/телефон|смартфон|электроник/iu, 'электроника'],
  [/одежд|плать|обув|кроссовк/iu, 'либос ва пойафзол'],
  [/дом|кухн|мебел|интерьер/iu, 'молҳои хона'],
  [/красот|космет|уход/iu, 'маҳсулоти зебоӣ ва нигоҳубин'],
  [/спорт|тренаж/iu, 'молҳои варзишӣ'],
  [/авто|автомобил/iu, 'молҳои автомобилӣ'],
  [/дет|игруш/iu, 'молҳои кӯдакона'],
];

function removeProductCta(description: string): string {
  if (!description.includes(PRODUCT_CTA_MARKER)) return description;
  return description
    .replace(new RegExp(`(?:${PRODUCT_CTA_TJ}|${PRODUCT_CTA_RU})`, 'giu'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function translateCategory(category: string): string {
  const normalized = category.trim();
  if (!normalized) return '';
  const known = CATEGORY_TAJIK_LABELS.find(([pattern]) => pattern.test(normalized));
  return known ? known[1] : translateKnownProductTerms(normalized);
}

function cleanRussianDescription(description: string): string {
  const source = description.trim();
  if (/(?:предназначенн\w*\s+барои|мавод\s+|технические характеристики и модели|длинноствольное ружье|длинное копье)/iu.test(source)
    || (source.match(/[\/|]/g) || []).length > 2) return '';
  const markers = Array.from(source.matchAll(/Описание товара:\s*/giu));
  const withoutGeneratedSections = markers.length
    ? source.slice(markers[markers.length - 1].index! + markers[markers.length - 1][0].length)
    : source.replace(/^Тавсифи маҳсулот:[\s\S]*?(?=Описание товара:|$)/i, '');
  const body = withoutGeneratedSections
    .replace(/^Описание товара:\s*/giu, '')
    .split(/(?:Тавсифи маҳсулот:|Характеристики:?|Категория:|Барои фармоиш додани ин|Заказывайте этот|Нет в наличии\.|Дар анбор мавҷуд нест\.)/iu)[0]
    .replace(/(?:Нет в наличии\.|Дар анбор мавҷуд нест\.)[\s\S]*$/iu, '')
    .replace(/\n?Ключевые слова для поиска:[\s\S]*$/i, '')
    .replace(/\n?Тавсифи маҳсулот:[\s\S]*$/i, '');
  return cleanProductDescription(body);
}

function cleanSpecificationPart(value: string): string {
  return value
    .replace(/[㐀-鿿]+/g, ' ')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s*\|\s*/g, ', ')
    .replace(/\s*;\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '')
    .trim();
}

export function filterProductSpecifications<T extends { name: string; value: string }>(
  specifications: T[],
): T[] {
  return specifications.filter((spec) => {
    if (!spec || typeof spec.name !== 'string' || typeof spec.value !== 'string') return false;
    const name = spec.name.trim();
    const mergedValueSeparators = spec.value.match(/\s+[\/|]\s+/gu) || [];
    return !/^технические характеристики и модели:?$/iu.test(name)
      && !/[|]|\s+\/\s+/u.test(name)
      && !/[|]/u.test(spec.value)
      && mergedValueSeparators.length < 2;
  });
}

function normalizeSpecifications(specifications: Array<{ name: string; value: string }>): Array<{ name: string; value: string }> {
  const seen = new Set<string>();
  return filterProductSpecifications(specifications)
    .filter((spec) => typeof spec.name === 'string' && typeof spec.value === 'string')
    .map((spec) => ({ name: cleanSpecificationPart(spec.name), value: cleanSpecificationPart(spec.value) }))
    .filter((spec) => {
      const key = spec.name.toLocaleLowerCase('ru');
      if (!spec.name || !spec.value || /^фото цвета:/i.test(spec.name) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export function buildBilingualProductDescription(
  description: string,
  title = '',
  specifications: Array<{ name: string; value: string }> = [],
  deliveryType: 'stock' | 'order' = 'order',
  category = '',
): string {
  const cleanBody = cleanRussianDescription(removeProductCta(removeOrderDeliveryNotice(description)));
  const validSpecifications = normalizeSpecifications(specifications);
  const russianFacts = validSpecifications.map(({ name, value }) => `${name}: ${value}`);
  const tajikFacts = validSpecifications.map(({ name, value }) => (
    `${TAJIK_SPEC_LABELS[name.toLocaleLowerCase('ru')] || translateKnownProductTerms(name)}: ${translateKnownProductTerms(value)}`
  ));
  const tajikCategory = translateCategory(category);
  const tajikDescription = [
    translateKnownProductTerms(title.trim()),
    tajikCategory ? `Категория: ${tajikCategory}` : '',
    ...tajikFacts,
  ]
    .filter(Boolean)
    .join('. ');
  const bilingualNotice = deliveryType === 'stock' ? BILINGUAL_STOCK_NOTICE : BILINGUAL_ORDER_NOTICE;
  const russianSections = [
    cleanBody ? `Описание товара:\n${cleanBody}` : '',
    category ? `Категория: ${category}` : '',
    russianFacts.length ? `Характеристики:\n${russianFacts.map((fact) => `• ${fact}`).join('\n')}` : '',
  ].filter(Boolean);
  const tajikSection = tajikDescription ? `Тавсифи маҳсулот:\n${tajikDescription}` : '';
  const tajikNotice = bilingualNotice.split('\n\n')[0] || '';
  const russianNotice = bilingualNotice.split('\n\n')[1] || '';
  return [tajikNotice, tajikSection, russianNotice, ...russianSections, PRODUCT_CTA_TJ, PRODUCT_CTA_RU].filter(Boolean).join('\n\n');
}
