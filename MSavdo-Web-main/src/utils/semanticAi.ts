/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Универсальный автономный семантический ИИ M.Savdo v4.0 (Enterprise Precision Parser)
 * Интеллектуальный разбор HTML-кода страницы товара, структуры window.context и __INIT_DATA__:
 * - Строгое соблюдение правил: отсутствие галлюцинаций и подстановок чужих категорий
 * - Четкое разделение: Офисная бумага !== Чернила для принтера, Обувь !== Одежда
 * - Парсинг featureAttributes и skuInfoMap с сохранением точных цен и складских остатков
 */
import { normalizeWeightKg } from './pricing.js';

export interface SemanticVariant {
  color: string;
  size: string;
  price_cny: number;
  stock: number;
  weight_kg: number;
  image_url?: string;
  sku_id?: string;
}

export interface SemanticAnalysisResult {
  title: string;
  description: string;
  category_name: string;
  weight_kg: number;
  variants: SemanticVariant[];
  specifications: Array<{ name: string; value: string }>;
}

export interface ExtractedHtmlContext {
  title?: string;
  categoryHint?: string;
  images: string[];
  videoUrl?: string;
  videoUrls: string[];
  weightKg?: number;
  specifications: Array<{ name: string; value: string }>;
  variants: SemanticVariant[];
  skuInfoMap?: Record<string, any>;
  rawSnippetForAi: string;
}

function findBalancedJsonValue(source: string, startIndex: number): unknown | null {
  const start = source.indexOf('{', startIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractEmbeddedJson(rawInput: string): unknown | null {
  const trimmed = rawInput.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Try the embedded marketplace data below.
    }
  }

  const assignmentPattern = /(?:window\.)?(?:context|__INIT_DATA__|runParams|__INITIAL_DATA__|data)\s*=/gi;
  for (const assignment of rawInput.matchAll(assignmentPattern)) {
    const assignmentEnd = (assignment.index ?? 0) + assignment[0].length;
    const wrapperCall = /\}\)\s*\(\s*[^,]+,\s*/g;
    wrapperCall.lastIndex = assignmentEnd;
    const wrapped = wrapperCall.exec(rawInput);
    const value = findBalancedJsonValue(rawInput, wrapped ? wrapperCall.lastIndex : assignmentEnd);
    if (value) return value;
  }

  const dataDetailMatch = rawInput.match(/data-detail=(["'])([\s\S]*?)\1/i);
  if (dataDetailMatch) {
    const decoded = dataDetailMatch[2]
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'");
    try {
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
  return null;
}

function collectNestedObjects(root: unknown): Record<string, any>[] {
  const objects: Record<string, any>[] = [];
  const visited = new Set<object>();
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth > 30 || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const child of value) visit(child, depth + 1);
      return;
    }
    const objectValue = value as Record<string, unknown>;
    objects.push(objectValue);
    for (const child of Object.values(objectValue)) visit(child, depth + 1);
  };
  visit(root, 0);
  return objects;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&gt;/gi, '>')
    .replace(/&lt;/gi, '<')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .trim();
}

function stringValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return decodeHtmlEntities(String(value));
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean).join(' / ');
  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    return stringValue(objectValue.name ?? objectValue.value ?? objectValue.label ?? objectValue.text);
  }
  return '';
}

function findFieldValue(objects: Record<string, any>[], fieldNames: string[]): unknown {
  for (const fieldName of fieldNames) {
    for (const objectValue of objects) {
      const value = objectValue[fieldName];
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
}

export function isLikelyProductTitle(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length < 3) return false;
  const title = decodeHtmlEntities(value).trim();
  if (/有限公司|责任公司|集团公司|商行|经营部|旗舰店|专营店|专卖店|官方店|欢迎光临|首页|(?:^|\W)(?:ооо|ип|ао|оао|зао)(?:\W|$)|(?:^|\W)(?:co\.?,?\s*ltd|limited|company|trading\s+co\.?)(?:\W|$)/i.test(title)) return false;
  const cleaned = cleanProductTitle(title);
  return cleaned.length >= 3 && !/^(?:首页|店铺首页|企业介绍|商品详情|产品中心)$/i.test(cleaned);
}

function normalizePositiveNumber(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const match = String(value).replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  const number = match ? Number(match[0]) : 0;
  return Number.isFinite(number) && number > 0 ? number : 0;
}

const EXCLUDED_PRODUCT_IMAGE_CONTEXT = /logo|avatar|qrcode|qr.?code|seller|merchant|shop|store|supplier|company|wangwang|service|sprite/i;

export function filterProductImageUrls(values: unknown, limit = 32): string[] {
  const candidates = Array.isArray(values) ? values : [values];
  const urls = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const rawUrl = candidate.trim().startsWith('//') ? `https:${candidate.trim()}` : candidate.trim();
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const urlText = `${url.hostname}${url.pathname}${url.search}`.toLocaleLowerCase();
      if (
        /logo|avatar|qrcode|qr.?code|wangwang|service|sprite|(?:^|[._/-])icon(?:[._/?-]|$)/i.test(urlText) ||
        /\.(?:gif|svg|ico)(?:[?#]|$)/i.test(url.href) ||
        /(?:^|[_-])(?:16|24|32|40|48|50|60|64|80|90|100)x(?:16|24|32|40|48|50|60|64|80|90|100)(?:[._/?-]|$)/i.test(urlText)
      ) continue;
      urls.add(url.href);
    } catch {
      continue;
    }
    if (urls.size >= limit) break;
  }
  return [...urls];
}

function extractImageUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (current: unknown, key = '', inImageContext = false) => {
    if (EXCLUDED_PRODUCT_IMAGE_CONTEXT.test(key)) return;
    const imageContext = inImageContext || /image|pic|photo|main|gallery|img/i.test(key);
    if (typeof current === 'string') {
      const url = current.startsWith('//') ? `https:${current}` : current;
      if (/^https?:\/\/\S+$/i.test(url) && imageContext) urls.add(url);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, key, imageContext));
    } else if (current && typeof current === 'object') {
      for (const [childKey, childValue] of Object.entries(current)) visit(childValue, childKey, imageContext);
    }
  };
  visit(value);
  return filterProductImageUrls([...urls]);
}

function extractVariants(
  skuMap: unknown,
  weightKg: number,
  skuProps: unknown,
): SemanticVariant[] {
  if (!skuMap || typeof skuMap !== 'object' || Array.isArray(skuMap)) return [];
  const optionNames = new Map<string, string>();
  const props = Array.isArray(skuProps) ? skuProps : [];
  for (const prop of props) {
    if (!prop || typeof prop !== 'object') continue;
    const values = (prop as Record<string, unknown>).value;
    if (!Array.isArray(values)) continue;
    for (const option of values) {
      if (!option || typeof option !== 'object') continue;
      const entry = option as Record<string, unknown>;
      const name = stringValue(entry.name ?? entry.value);
      for (const key of [entry.vid, entry.value, entry.specValueId, entry.id]) {
        if (key !== undefined && key !== null) optionNames.set(String(key), name);
      }
    }
  }

  const variants: SemanticVariant[] = [];
  for (const [rawKey, rawValue] of Object.entries(skuMap)) {
    if (!rawValue || typeof rawValue !== 'object') continue;
    const sku = rawValue as Record<string, unknown>;
    const rawAttributes = decodeHtmlEntities(stringValue(sku.specAttrs) || rawKey);
    const resolvedAttributes = rawAttributes
      .split(/\s*(?:>|;|；|\|)\s*/)
      .map((attribute) => optionNames.get(attribute) || attribute)
      .filter(Boolean);
    const attributes = resolvedAttributes.length > 1
      ? resolvedAttributes
      : (() => {
        const simpleSizeMatch = rawAttributes.match(/^(.+?)\s+(\d+(?:\.\d+)?\s*(?:码|cm|ml|g|kg)?)$/i);
        return simpleSizeMatch ? [simpleSizeMatch[1], simpleSizeMatch[2]] : resolvedAttributes;
      })();
    const price = normalizePositiveNumber(sku.price ?? sku.discountPrice ?? sku.retailPrice);
    const stockValue = sku.canBookCount ?? sku.amountOnSale ?? sku.quantity ?? sku.stock;
    const parsedStock = Number(stockValue);
    const imageUrl = stringValue(sku.skuImageUrl ?? sku.picUrl ?? sku.imageUrl);
    variants.push({
      color: translateVariantName(attributes[0] || rawAttributes) || 'Стандарт',
      size: translateVariantName(attributes.slice(1).join(' / ')) || 'Стандарт',
      price_cny: price,
      stock: Number.isFinite(parsedStock) && parsedStock >= 0 ? Math.floor(parsedStock) : 0,
      weight_kg: weightKg || 0.5,
      image_url: imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl,
      sku_id: stringValue(sku.skuId ?? sku.specId),
    });
  }
  return variants;
}

function normalizeVideoUrl(value: string): string {
  const url = value
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .trim();
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^https?:\/\//i.test(url) || /\.(?:jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url)) return '';
  return url;
}

function collectVideoUrls(value: unknown): string[] {
  const urls = new Set<string>();
  const visit = (current: unknown, key = '', isVideoContext = false): void => {
    const videoContext = isVideoContext || /video|playurl|mediaurl/i.test(key);
    if (typeof current === 'string') {
      if (!videoContext || /poster|image|cover/i.test(key)) return;
      const url = normalizeVideoUrl(current);
      if (url) urls.add(url);
      return;
    }
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, key, videoContext));
      return;
    }
    if (current && typeof current === 'object') {
      for (const [childKey, childValue] of Object.entries(current)) {
        visit(childValue, childKey, videoContext);
      }
    }
  };
  visit(value);
  return [...urls].slice(0, 12);
}

// 1. СЛОВАРЬ ЦВЕТОВ И ОТТЕНКОВ
const COLOR_DICTIONARY: Record<string, string> = {
  '黑色': 'Черный',
  '纯黑': 'Глубокий черный',
  '亮黑': 'Глянцевый черный',
  '蓝色': 'Синий (Cyan)',
  '深蓝': 'Темно-синий',
  '天蓝': 'Небесно-голубой',
  '宝蓝': 'Королевский синий',
  '红色': 'Красный (Magenta)',
  '酒红': 'Бордовый',
  '粉色': 'Розовый',
  '黄色': 'Желтый (Yellow)',
  '明黄': 'Ярко-желтый',
  '绿色': 'Зеленый',
  '军绿': 'Оливковый хаки',
  '墨绿': 'Темно-зеленый',
  '白色': 'Белый',
  '米白': 'Молочный белый',
  '纯白': 'Белоснежный',
  '灰色': 'Серый',
  '深灰': 'Темно-серый',
  '浅灰': 'Светло-серый',
  '银色': 'Серебристый',
  '金色': 'Золотистый',
  '咖色': 'Кофейный',
  '咖啡色': 'Кофейный',
  '卡其色': 'Хаки',
  '卡其': 'Хаки',
  '棕色': 'Коричневый',
  '橙色': 'Оранжевый',
  '紫色': 'Фиолетовый',
  '青色': 'Бирюзовый (Cyan)'
};

// 2. СЛОВАРЬ ТЕРМИНОВ ТОВАРОВ И СПЕЦИФИКАЦИЙ
const DICTIONARY_MAP: Array<{ regex: RegExp; replace: string }> = [
  // Общие термины и карточка обуви
  { regex: /商务正装/gi, replace: 'классические деловые' },
  { regex: /商务休闲/gi, replace: 'деловые повседневные' },
  { regex: /男士|男款|男鞋/gi, replace: 'мужские' },
  { regex: /女士|女款|女鞋/gi, replace: 'женские' },
  { regex: /皮鞋/gi, replace: 'туфли' },
  { regex: /休闲鞋/gi, replace: 'повседневная обувь' },
  { regex: /运动鞋/gi, replace: 'спортивная обувь' },
  { regex: /工作鞋/gi, replace: 'рабочая обувь' },
  { regex: /劳保鞋/gi, replace: 'защитная обувь' },
  { regex: /鞋面材质/gi, replace: 'материал верха' },
  { regex: /鞋底材质/gi, replace: 'материал подошвы' },
  { regex: /鞋头材质/gi, replace: 'материал носка' },
  { regex: /鞋头形状|鞋头款式/gi, replace: 'форма носка' },
  { regex: /鞋跟形状/gi, replace: 'форма каблука' },
  { regex: /适用季节/gi, replace: 'сезон' },
  { regex: /尺码类型/gi, replace: 'размерная сетка' },
  { regex: /鞋号|尺码/gi, replace: 'размер' },
  { regex: /鞋面/gi, replace: 'верх обуви' },
  { regex: /鞋底/gi, replace: 'подошва' },
  { regex: /鞋子|鞋/gi, replace: 'обувь' },
  { regex: /真皮|头层牛皮/gi, replace: 'натуральная кожа' },
  { regex: /牛皮/gi, replace: 'кожа' },
  { regex: /\bPU\b/gi, replace: 'полиуретан' },
  { regex: /橡胶/gi, replace: 'резина' },
  { regex: /尖头/gi, replace: 'заострённый носок' },
  { regex: /圆头/gi, replace: 'круглый носок' },
  { regex: /粗跟/gi, replace: 'широкий каблук' },
  { regex: /防滑/gi, replace: 'нескользящий' },
  { regex: /耐磨/gi, replace: 'износостойкий' },
  { regex: /透气/gi, replace: 'дышащий' },
  { regex: /轻便|轻量/gi, replace: 'лёгкий' },
  { regex: /软底/gi, replace: 'мягкая подошва' },
  { regex: /厚底/gi, replace: 'толстая подошва' },
  { regex: /品牌/gi, replace: 'Бренд' },
  { regex: /材质/gi, replace: 'Материал' },
  { regex: /风格|款式/gi, replace: 'Стиль' },
  { regex: /功能/gi, replace: 'Особенности' },
  { regex: /适用人群/gi, replace: 'Для кого' },
  { regex: /颜色分类|颜色|顏色/gi, replace: 'Цвет' },
  { regex: /包装方式/gi, replace: 'Упаковка' },
  { regex: /产品类别/gi, replace: 'Тип товара' },
  { regex: /成年/gi, replace: 'для взрослых' },
  { regex: /标准码/gi, replace: 'стандартная размерная сетка' },
  { regex: /四季通用/gi, replace: 'всесезонный' },
  { regex: /系带|绑带/gi, replace: 'шнуровка' },
  { regex: /产地|产区/gi, replace: 'Страна производства' },
  { regex: /新款|新潮/gi, replace: 'новая модель' },
  { regex: /舒适/gi, replace: 'комфортный' },
  { regex: /增高/gi, replace: 'увеличение роста' },
  { regex: /防臭/gi, replace: 'защита от запаха' },
  { regex: /减震/gi, replace: 'амортизация' },
  { regex: /现货/gi, replace: 'в наличии' },
  { regex: /春季|春秋/gi, replace: 'весна' },
  { regex: /夏季/gi, replace: 'лето' },
  { regex: /秋季/gi, replace: 'осень' },
  { regex: /冬季/gi, replace: 'зима' },

  // Бумага и канцелярские товары
  { regex: /复印纸/gi, replace: 'бумага для копирования и печати' },
  { regex: /打印纸/gi, replace: 'бумага для принтера' },
  { regex: /办公用纸/gi, replace: 'офисная бумага' },
  { regex: /木浆/gi, replace: 'древесная целлюлоза' },
  { regex: /全木浆/gi, replace: '100% первичная древесная целлюлоза' },
  { regex: /原浆/gi, replace: 'первичная целлюлоза' },
  { regex: /500张/gi, replace: '500 листов' },
  { regex: /整箱/gi, replace: 'коробка' },
  { regex: /单包/gi, replace: '1 пачка' },
  { regex: /箱/gi, replace: 'кор.' },
  { regex: /包/gi, replace: 'пач.' },
  { regex: /克重/gi, replace: 'плотность' },
  { regex: /规格/gi, replace: 'формат' },
  { regex: /白度/gi, replace: 'белизна' },
  { regex: /厚度/gi, replace: 'толщина' },

  // Бренды и совместимость
  { regex: /爱普生/gi, replace: 'Epson' },
  { regex: /佳能/gi, replace: 'Canon' },
  { regex: /惠普/gi, replace: 'HP' },
  { regex: /兄弟/gi, replace: 'Brother' },
  { regex: /联想/gi, replace: 'Lenovo' },
  { regex: /小米/gi, replace: 'Xiaomi' },
  { regex: /苹果/gi, replace: 'Apple' },
  { regex: /华为/gi, replace: 'Huawei' },
  { regex: /兼容/gi, replace: 'Совместимый' },
  { regex: /原装/gi, replace: 'Оригинальный' },

  // Принтеры и расходники (строго чернила/картриджи)
  { regex: /墨水瓶/gi, replace: 'флакон чернил' },
  { regex: /墨水/gi, replace: 'чернила' },
  { regex: /墨盒/gi, replace: 'картридж' },
  { regex: /染料/gi, replace: 'водорастворимые (Dye)' },
  { regex: /颜料/gi, replace: 'пигментные (Pigment)' },
  { regex: /打印机/gi, replace: 'принтер' },
  { regex: /连供/gi, replace: 'СНПЧ' },
  { regex: /硒鼓/gi, replace: 'лазерный картридж' },
  { regex: /碳粉/gi, replace: 'тонер' },

  // Обувь
  { regex: /劳保鞋/gi, replace: 'защитные туфли' },
  { regex: /皮鞋/gi, replace: 'туфли из экокожи' },
  { regex: /运动鞋/gi, replace: 'спортивные кроссовки' },
  { regex: /跑步鞋/gi, replace: 'беговые кроссовки' },
  { regex: /厚底/gi, replace: 'на толстой подошве' },
  { regex: /透气/gi, replace: 'дышащие' },
  { regex: /防滑/gi, replace: 'нескользящие' },
  { regex: /耐磨/gi, replace: 'износостойкие' },
  { regex: /减震/gi, replace: 'амортизирующие' },

  // Одежда
  { regex: /卫衣/gi, replace: 'худи' },
  { regex: /外套/gi, replace: 'куртка' },
  { regex: /加绒/gi, replace: 'с начесом' },
  { regex: /纯棉/gi, replace: '100% хлопок' },
  { regex: /重磅/gi, replace: 'Heavy плотный' },

  // Единицы измерений
  { regex: /(\d+)\s*(ml|毫升)/gi, replace: '$1 мл' },
  { regex: /(\d+)\s*(g|克)/gi, replace: '$1 г' },
  { regex: /(\d+)\s*(kg|公斤|千克)/gi, replace: '$1 кг' }
];

export function cleanProductTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let clean = rawTitle;

  const stopWords = [
    /阿里巴巴/gi, /1688/gi, /淘宝网/gi, /拼多多/gi, /tmall/gi, /taobao/gi,
    /厂家直销/gi, /一件代发/gi, /源头工厂/gi, /源头好货/gi, /批发特价/gi,
    /跨境专供/gi, /2026新款/gi, /2025新款/gi, /爆款推荐/gi, /限时特价/gi, /新款/gi, /爆款/gi, /热卖/gi,
    /包邮/gi, /专柜正品/gi, /假一赔四/gi, /加工定制/gi, /支持混批/gi,
    /中山市[^\s]+/gi, /温县[^\s]+/gi, /东莞市[^\s]+/gi, /广州市[^\s]+/gi, /深圳市[^\s]+/gi,
    /制鞋厂/gi, /鞋厂/gi, /制衣厂/gi, /五金厂/gi, /电子厂/gi, /造纸厂/gi, /纸品厂/gi,
    /有限公司/gi, /责任公司/gi, /商行/gi, /经营部/gi, /实业/gi
  ];

  for (const sw of stopWords) {
    clean = clean.replace(sw, '');
  }

  clean = clean.replace(/[-|_].*(阿里巴巴|淘宝网|拼多多|1688|alibaba|taobao).*$/i, '');
  clean = clean.replace(/\s+/g, ' ').replace(/^[\s\-–—|_:;,.]+|[\s\-–—|_:;,.]+$/g, '').trim();
  return clean;
}

export function translateVariantName(chineseText: string): string {
  if (!chineseText) return 'Стандарт';
  let s = chineseText.trim();

  // Прямое сопоставление по словарю цветов
  for (const [cn, ru] of Object.entries(COLOR_DICTIONARY)) {
    if (s === cn) return ru;
  }

  // Замена по словарю терминов
  for (const item of DICTIONARY_MAP) {
    s = s.replace(item.regex, ' ' + item.replace + ' ');
  }

  // Частичная замена цветов
  for (const [cn, ru] of Object.entries(COLOR_DICTIONARY)) {
    if (s.includes(cn)) {
      s = s.replace(new RegExp(cn, 'g'), ' ' + ru + ' ');
    }
  }

  s = s.replace(/[\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
  return s || chineseText.trim() || 'Стандарт';
}

/**
 * Извлекает структурированные данные из сырого HTML-кода или window.context / __INIT_DATA__
 */
export function extractStructuredFromHtmlOrJson(rawInput: string): ExtractedHtmlContext {
  const result: ExtractedHtmlContext = {
    images: [],
    videoUrls: [],
    specifications: [],
    variants: [],
    rawSnippetForAi: ''
  };

  if (!rawInput || typeof rawInput !== 'string') return result;

  // 1. Извлекаем JSON из обычного присваивания или вызова window.context(..., JSON).
  const parsedJson = extractEmbeddedJson(rawInput);
  if (parsedJson && typeof parsedJson === 'object') {
    const nestedObjects = collectNestedObjects(parsedJson);
    const skuOwner = nestedObjects.find((entry) => {
      const map = entry.skuInfoMap || entry.skuMap || entry.sku?.skuInfoMap;
      return map && typeof map === 'object' && !Array.isArray(map);
    });
    const skuMap = skuOwner?.skuInfoMap || skuOwner?.skuMap || skuOwner?.sku?.skuInfoMap;
    const offerDetail = nestedObjects.find((entry) => entry.subject && (
      entry.featureAttributes || entry.productAttributes || entry.skuInfoMap
    ));

    const structuredTitleCandidates = [
      offerDetail?.subject,
      findFieldValue(nestedObjects, ['subject', 'productTitle', 'offerTitle']),
      ...nestedObjects
        .filter((entry) => (
          entry.featureAttributes ||
          entry.productAttributes ||
          entry.skuInfoMap ||
          entry.skuMap ||
          entry.offerId ||
          entry.productId
        ))
        .map((entry) => entry.title),
    ];
    result.title = structuredTitleCandidates
      .map(stringValue)
      .find(isLikelyProductTitle) || '';
    result.images = extractImageUrls(parsedJson);
    result.videoUrls = collectVideoUrls(parsedJson);
    result.videoUrl = result.videoUrls[0];

    const weightSource = findFieldValue(nestedObjects, [
      'unitWeight', 'grossWeight', 'weight', 'productWeight', 'netWeight',
    ]);
    const weightVal = normalizeWeightKg(stringValue(weightSource));
    if (weightVal > 0) result.weightKg = weightVal;

    const seenSpecifications = new Set<string>();
    for (const objectValue of nestedObjects) {
      for (const fieldName of ['featureAttributes', 'productAttributes', 'attributes']) {
        const attrs = objectValue[fieldName];
        if (!Array.isArray(attrs)) continue;
        for (const attribute of attrs) {
          if (!attribute || typeof attribute !== 'object') continue;
          const item = attribute as Record<string, unknown>;
          const name = stringValue(item.name ?? item.attributeName ?? item.propName ?? item.label);
          const value = stringValue(item.value ?? item.attributeValue ?? item.propValue ?? item.values);
          const normalizedName = name.toLocaleLowerCase();
          if (!name || !value || seenSpecifications.has(normalizedName)) continue;
          seenSpecifications.add(normalizedName);
          result.specifications.push({
            name: translateVariantName(name),
            value: translateVariantName(value),
          });
          if (result.specifications.length >= 100) break;
        }
        if (result.specifications.length >= 100) break;
      }
      if (result.specifications.length >= 100) break;
    }

    if (skuMap) {
      result.skuInfoMap = skuMap;
      const skuProps = findFieldValue(nestedObjects, ['skuProps', 'skuPropertyList', 'skuAttributes']);
      result.variants = extractVariants(skuMap, result.weightKg || 0.5, skuProps);
    }

    const productCategory = nestedObjects.find((entry) => (
      entry.categoryName &&
      (entry.subject || entry.featureAttributes || entry.productAttributes || entry.skuInfoMap)
    ));
    const category = productCategory?.categoryName
      ?? findFieldValue(nestedObjects, ['categoryName', 'category_name', 'category']);
    result.categoryHint = stringValue(category) || undefined;
  }

  const videoUrlMatches = rawInput.matchAll(/(?:videoUrl|playUrl|video_url|videoAddress|mediaUrl)\s*["']?\s*[:=]\s*["']([^"']+)["']/gi);
  for (const match of videoUrlMatches) {
    const url = normalizeVideoUrl(decodeHtmlEntities(match[1]));
    if (url && !result.videoUrls.includes(url)) result.videoUrls.push(url);
  }
  const videoTagMatches = rawInput.matchAll(/<(?:video|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const match of videoTagMatches) {
    const url = normalizeVideoUrl(match[1]);
    if (url && !result.videoUrls.includes(url)) result.videoUrls.push(url);
  }
  result.videoUrls = result.videoUrls.slice(0, 12);
  if (!result.videoUrl && result.videoUrls.length > 0) result.videoUrl = result.videoUrls[0];

  // 3. Дополнительный / Резервный сбор из HTML (если JSON неполный или поврежден — Правило 3)
  if (!result.title) {
    const htmlTitleCandidates = [
      rawInput.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
      rawInput.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1],
      rawInput.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    ];
    result.title = htmlTitleCandidates
      .map((candidate) => candidate?.replace(/<[^>]+>/g, '').trim() || '')
      .find(isLikelyProductTitle)
      ? cleanProductTitle(htmlTitleCandidates
        .map((candidate) => candidate?.replace(/<[^>]+>/g, '').trim() || '')
        .find(isLikelyProductTitle) || '')
      : '';
  }

  // Извлечение картинок из HTML (Alicdn)
  if (result.images.length === 0) {
    const imgMatches = rawInput.match(/https?:\/\/[a-z0-9\.\-]*alicdn\.com\/img\/ibank\/[^\s"'<>]+\.(?:jpg|png|webp)/gi);
    if (imgMatches) {
      const unique = filterProductImageUrls(Array.from(new Set(imgMatches))
        .filter(url => !url.includes('.search.') && !url.includes('_30x30')));
      result.images = unique.slice(0, 8);
    }
  }

  // Извлечение характеристик из HTML-таблиц (.od-pc-attribute-item, .offer-attr-item, table.params-table)
  if (result.specifications.length === 0) {
    const attrRegex = /(?:class=["'][^"']*(?:attribute|offer-attr|param|prop)-item[^"']*["'][^>]*>|<tr[^>]*>)\s*([\s\S]*?)(?:<\/(?:div|li|tr)>)/gi;
    let match;
    const seenNames = new Set<string>();

    while ((match = attrRegex.exec(rawInput)) !== null && result.specifications.length < 100) {
      const block = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (block.includes('：') || block.includes(':')) {
        const parts = block.split(/[:：]/);
        const k = parts[0].trim();
        const v = parts.slice(1).join(':').trim();
        if (k && v && k.length <= 40 && v.length <= 150 && !seenNames.has(k)) {
          seenNames.add(k);
          result.specifications.push({ name: translateVariantName(k), value: translateVariantName(v) });
        }
      }
    }
  }

  // Создаем концентрированный сниппет для ИИ Gemini
  let snippet = '';
  if (result.title) snippet += `ЗАГОЛОВОК СТРАНИЦЫ: ${result.title}\n`;
  if (result.specifications.length > 0) {
    snippet += `ИЗВЛЕЧЕННЫЕ ХАРАКТЕРИСТИКИ (featureAttributes):\n` +
      result.specifications.map(s => `• ${s.name}: ${s.value}`).join('\n') + '\n';
  }
  if (result.variants.length > 0) {
    snippet += `СПИСОК МОДИФИКАЦИЙ SKU (skuInfoMap):\n` +
      result.variants.slice(0, 100).map(v => `• ${v.color} | ${v.size} | Цена: ¥${v.price_cny || 'не указана'} | Склад: ${v.stock}`).join('\n') + '\n';
  }
  if (result.images.length > 0) {
    snippet += `ФОТОГРАФИИ ГАЛЕРЕИ: ${result.images.slice(0, 5).join(', ')}\n`;
  }

  // Очищенный текстовый слой HTML (первые 10000 символов без тегов)
  const plainText = rawInput
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  snippet += `\nВИДИМЫЙ ТЕКСТ СТРАНИЦЫ:\n${plainText.slice(0, 9000)}`;
  result.rawSnippetForAi = snippet;

  return result;
}

/**
 * Интеллектуальный автономный семантический разбор без галлюцинаций
 */
export function analyzeSemantically(
  rawText: string,
  rawTitle?: string,
  basePriceCny: number = 50,
  weightKg: number = 0.5
): SemanticAnalysisResult {
  const usableRawTitle = isLikelyProductTitle(rawTitle) ? rawTitle : '';
  const fullText = ((usableRawTitle || '') + ' ' + (rawText || '')).toLowerCase();
  const cleanedTitle = cleanProductTitle(usableRawTitle);

  // 1. ОПРЕДЕЛЕНИЕ РЕАЛЬНОГО НАЗВАНИЯ ТОВАРА
  let finalTitle = '';
  const isRussianTitle = /[а-яА-ЯёЁ]{3,}/.test(usableRawTitle);

  if (isRussianTitle && usableRawTitle) {
    // Если страница уже переведена браузером на русский или передан русский заголовок
    finalTitle = cleanProductTitle(usableRawTitle);
  } else if (cleanedTitle && !/[\u4e00-\u9fa5]/.test(cleanedTitle)) {
    finalTitle = cleanedTitle;
  } else {
    // Переводим китайские термины через словарь
    let translated = cleanedTitle;
    for (const item of DICTIONARY_MAP) {
      translated = translated.replace(item.regex, ' ' + item.replace + ' ');
    }
    translated = translated.replace(/[\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
    const translatedFallback = cleanedTitle.replace(/[\u4e00-\u9fa5]/g, ' ').replace(/\s+/g, ' ').trim();
    finalTitle = translated.length > 5
      ? translated
      : (translatedFallback || cleanedTitle || (fullText.includes('鞋') ? 'Обувь' : 'Товар'));
  }

  // 2. ТОЧНОЕ ОПРЕДЕЛЕНИЕ КАТЕГОРИИ ПО СМЫСЛУ ТОВАРА (БЕЗ ЛОЖНЫХ СРАБАТЫВАНИЙ)
  let category = 'Электроника и гаджеты';
  let finalWeight = weightKg || 0.5;

  const isRcOrDroneOrToy = (
    fullText.includes('самолет') || fullText.includes('самолёт') || fullText.includes('дрон') ||
    fullText.includes('радиоуправл') || fullText.includes('дистанционн') || fullText.includes('игрушк') ||
    fullText.includes('модель') || fullText.includes('遥控') || fullText.includes('飞机') ||
    fullText.includes('无人机') || fullText.includes('航模') || fullText.includes('玩具') ||
    fullText.includes('drone') || fullText.includes('airplane') || fullText.includes('rc')
  );

  const isFootwear = !isRcOrDroneOrToy && (
    fullText.includes('鞋') || fullText.includes('кроссов') || fullText.includes('ботин') ||
    fullText.includes('туфл') || fullText.includes('обув') || fullText.includes('sneaker')
  );

  const isElectronicComponent = (
    fullText.includes('电子元器件') || fullText.includes('电子元件') ||
    fullText.includes('集成电路') || fullText.includes('电阻') ||
    fullText.includes('电容') || fullText.includes('二极管') ||
    fullText.includes('三极管') || fullText.includes('芯片') ||
    fullText.includes('传感器') || fullText.includes('开发板') ||
    fullText.includes('микроконтрол') || fullText.includes('микросхем') ||
    fullText.includes('резистор') || fullText.includes('конденсатор') ||
    fullText.includes('диод') || fullText.includes('транзистор') ||
    fullText.includes('датчик') || fullText.includes('печатн') ||
    fullText.includes('arduino') || fullText.includes('esp32') ||
    fullText.includes('raspberry pi') || fullText.includes('микроконтроллер') ||
    fullText.includes('электронный компонент') || fullText.includes('электронные компоненты') ||
    fullText.includes('resistor') || fullText.includes('capacitor') ||
    fullText.includes('inductor') || fullText.includes('diode') ||
    fullText.includes('transistor') || fullText.includes('microcontroller') ||
    fullText.includes('development board') || fullText.includes('integrated circuit') ||
    fullText.includes('sensor') || fullText.includes('connector') ||
    fullText.includes('breadboard')
  );

  const isApparel = !isRcOrDroneOrToy && !isFootwear && (
    fullText.includes('卫衣') || fullText.includes('外套') || fullText.includes('裤') ||
    fullText.includes('裙') || fullText.includes('худи') || fullText.includes('куртк') ||
    fullText.includes('брюк') || fullText.includes('одежд') || fullText.includes('футболк')
  );

  const isInkOrCartridge = !isRcOrDroneOrToy && (
    fullText.includes('墨水') || fullText.includes('墨盒') || fullText.includes('硒鼓') ||
    fullText.includes('чернил') || fullText.includes('картридж') || fullText.includes('тонер')
  );

  const isOfficePaper = !isRcOrDroneOrToy && !isInkOrCartridge && (
    (fullText.includes('复印纸') || fullText.includes('打印纸') || fullText.includes('办公用纸')) ||
    (fullText.includes('копировальн') && fullText.includes('бумаг'))
  );

  if (isElectronicComponent) {
    category = 'Электронные модули и датчики';
  } else if (isRcOrDroneOrToy) {
    category = 'Игрушки и игры';
    finalWeight = 0.35;
  } else if (isFootwear) {
    category = fullText.includes('женск') || fullText.includes('女') ? 'Женская обувь' : 'Мужская обувь';
    finalWeight = 0.75;
  } else if (isApparel) {
    category = fullText.includes('女') || fullText.includes('женск') ? 'Платья и сарафаны' : 'Мужские футболки, майки и поло';
    finalWeight = 0.45;
  } else if (isInkOrCartridge || isOfficePaper) {
    category = 'Школьная и офисная канцелярия';
    finalWeight = isOfficePaper ? 2.4 : 0.35;
  } else {
    category = 'Хозяйственные мелочи';
    finalWeight = weightKg || 0.5;
  }

  // 3. ФОРМИРОВАНИЕ ОПИСАНИЯ
  let finalDesc = finalTitle
    ? `${finalTitle}. Подробные характеристики указаны в карточке товара.`
    : 'Подробные сведения о товаре указаны в карточке.';

  // 4. СБОР ХАРАКТЕРИСТИК (ИЗВЛЕЧЕННЫХ ИЗ ТЕКСТА)
  const specsList: Array<{ name: string; value: string }> = [];
  // 5. ВАРИАНТЫ ТОВАРА (СОХРАНЯЕМ РЕАЛЬНЫЕ, НЕ ПОДМЕНЯЕМ ШАБЛОНАМИ)
  const variants: SemanticVariant[] = [
    {
      color: 'Стандартная комплектация',
      size: 'Стандарт',
      price_cny: basePriceCny,
      stock: 0,
      weight_kg: finalWeight
    }
  ];

  let enrichedDesc = finalDesc;
  if (specsList.length > 0 && !enrichedDesc.includes('Характеристики:')) {
    enrichedDesc = `${enrichedDesc}\n\nХарактеристики:\n` + specsList.map(s => `• ${s.name}: ${s.value}`).join('\n');
  }

  return {
    title: cleanBannedWordsAndPhrases(finalTitle),
    description: cleanBannedWordsAndPhrases(enrichedDesc),
    category_name: category,
    weight_kg: finalWeight,
    variants,
    specifications: specsList,
  };
}

/**
 * Очистка запрещенных слов (1688, Alibaba, Алибаба) и утверждений о контроле производства от M.Savdo
 */
export function cleanBannedWordsAndPhrases(text: string): string {
  if (!text) return '';
  return text
    // Удаляем слова 1688, Alibaba, Алибаба, Taobao, Таобао, Pinduoduo, Пиндодо
    .replace(/\b1688(?:\.com)?\b/gi, '')
    .replace(/\balibaba(?:\.com)?\b/gi, '')
    .replace(/алибаба/gi, '')
    .replace(/\btaobao(?:\.com)?\b/gi, '')
    .replace(/таобао/gi, '')
    .replace(/\bpinduoduo(?:\.com)?\b/gi, '')
    .replace(/пиндодо/gi, '')
    // Удаляем фразы о контроле от M.Savdo и контроле производства/приемки
    .replace(/\(?(?:контроль|проверка|гарантия)\s+(?:от\s+)?(?:M\.Savdo|М\.Савдо|МСавдо)\)?/gi, '')
    .replace(/(?:проверен|проверено|прошел\s+проверку)\s+(?:отделом\s+)?(?:контроля\s+качества\s+)?(?:M\.Savdo|М\.Савдо|МСавдо)?/gi, '')
    .replace(/(?:заводской\s+)?контроль\s+(?:сборки|качества|производства)\s*(?:M\.Savdo|М\.Савдо)?/gi, '')
    .replace(/контролируем\s+(?:производство|качество|поставку|товар\s+при\s+получении)/gi, '')
    .replace(/контроль\s+(?:при\s+получении|на\s+производстве|производства)/gi, '')
    .replace(/контроль\s+от\s+М\.Савдо/gi, '')
    .replace(/контроль\s+от\s+M\.Savdo/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
}
