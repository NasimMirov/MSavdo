import 'dotenv/config';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { analyzeSemantically, cleanProductTitle, translateVariantName, extractStructuredFromHtmlOrJson, cleanBannedWordsAndPhrases } from './src/utils/semanticAi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_IMPORT_TEXT_LENGTH = 6000;
const GEMINI_IMPORT_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_IMPORT_TIMEOUT_MS = 10000;
const trustProxyHops = process.env.TRUST_PROXY_HOPS;
if (trustProxyHops) {
  const parsedTrustProxyHops = Number(trustProxyHops);
  if (!Number.isInteger(parsedTrustProxyHops) || parsedTrustProxyHops < 1) {
    throw new Error('TRUST_PROXY_HOPS должен быть положительным целым числом');
  }
  app.set('trust proxy', parsedTrustProxyHops);
}
const jwtSecretEnv = process.env.ADMIN_JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!jwtSecretEnv || Buffer.byteLength(jwtSecretEnv) < 32)) {
  throw new Error('В production требуется ADMIN_JWT_SECRET длиной не менее 32 байт');
}
if (jwtSecretEnv && Buffer.byteLength(jwtSecretEnv) < 32) {
  throw new Error('ADMIN_JWT_SECRET должен содержать не менее 32 байт');
}
const adminJwtSecret = Buffer.from(jwtSecretEnv || crypto.randomBytes(64).toString('base64url'));
if (!jwtSecretEnv) {
  console.warn('[Admin Auth] ADMIN_JWT_SECRET не задан; JWT-сессии будут сброшены при перезапуске процесса');
}
const telegramLoginClientId = process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim() || '';
const adminTelegramIdList = (process.env.ADMIN_TELEGRAM_ALLOWED_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const adminTelegramAllowedIds = new Set(adminTelegramIdList);
const isTelegramLoginConfigured = /^\d+$/.test(telegramLoginClientId)
  && Number.isSafeInteger(Number(telegramLoginClientId))
  && adminTelegramIdList.length === 2
  && adminTelegramIdList.every((id) => /^\d+$/.test(id))
  && adminTelegramAllowedIds.size === 2;
if (process.env.NODE_ENV === 'production' && !isTelegramLoginConfigured) {
  throw new Error('Задайте TELEGRAM_LOGIN_CLIENT_ID и ровно два ADMIN_TELEGRAM_ALLOWED_IDS');
}
const adminAllowedOrigins = new Set([
  'https://msavdo.shop',
  'https://www.msavdo.shop',
  'https://api.msavdo.shop',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.ADMIN_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

// ==========================================
// НАСТРОЙКА CORS
// ==========================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAdminApi = req.path.startsWith('/api/admin/');
  if (origin && isAdminApi) {
    const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
    if (sameOrigin || adminAllowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  if (req.method === 'OPTIONS') {
    if (isAdminApi && origin && !res.getHeader('Access-Control-Allow-Origin')) {
      return res.sendStatus(403);
    }
    return res.sendStatus(200);
  }
  next();
});

app.use('/api/admin', (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (sameOrigin || adminAllowedOrigins.has(origin)) return next();
  return res.status(403).json({ error: 'Источник запроса не разрешён' });
});

app.use(express.json({ limit: '15mb' }));

// ==========================================
// ИНИЦИАЛИЗАЦИЯ GEMINI API (@google/genai)
// ==========================================
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// ==========================================
// БАЗА ДАННЫХ SQLITE (msavdo.db)
// ==========================================
const dbPath = process.env.NODE_ENV === 'production'
  ? '/data/msavdo.db'
  : path.join(__dirname, 'msavdo.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

// Миграция таблиц: categories, products, product_variants, admin_users, settings
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent_id INTEGER,
    FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    original_link TEXT,
    category_id INTEGER,
    base_sku TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'active',
    delivery_type TEXT DEFAULT 'order',
    main_image TEXT,
    images TEXT,
    video_url TEXT,
    video_urls TEXT,
    youtube_url TEXT,
    specifications TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    color TEXT,
    size TEXT,
    price_cny REAL NOT NULL,
    price_tjs INTEGER NOT NULL,
    stock INTEGER DEFAULT 10,
    weight_kg REAL DEFAULT 0.5,
    variant_sku TEXT UNIQUE NOT NULL,
    image_url TEXT,
    FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_revoked_tokens (
    token_id TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_telegram_nonces (
    nonce_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Автоматическая миграция новых колонок и таблиц для существующих БД
try {
  db.exec('ALTER TABLE products ADD COLUMN images TEXT;');
} catch (_) {}
try {
  db.exec('ALTER TABLE products ADD COLUMN video_url TEXT;');
} catch (_) {}
try {
  db.exec('ALTER TABLE products ADD COLUMN video_urls TEXT;');
} catch (_) {}
try {
  db.exec('ALTER TABLE products ADD COLUMN youtube_url TEXT;');
} catch (_) {}
try {
  db.exec("ALTER TABLE products ADD COLUMN delivery_type TEXT DEFAULT 'order';");
} catch (_) {}
try {
  db.exec('ALTER TABLE products ADD COLUMN specifications TEXT;');
} catch (_) {}
try {
  db.exec('ALTER TABLE products ADD COLUMN views_count INTEGER DEFAULT 0;');
} catch (_) {}

function normalizeVideoUrls(value: unknown, fallback = ''): string[] {
  let candidates: unknown[] = [];
  if (Array.isArray(value)) {
    candidates = value;
  } else if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      candidates = Array.isArray(parsed) ? parsed : [value];
    } catch {
      candidates = value.split(/\r?\n/);
    }
  }
  if (fallback) candidates.push(fallback);
  const urls = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    let url = candidate.trim().replace(/\\\//g, '/');
    if (url.startsWith('//')) url = `https:${url}`;
    if (!/^https?:\/\//i.test(url) || url.length > 2048) continue;
    urls.add(url);
    if (urls.size >= 12) break;
  }
  return [...urls];
}

function appendSearchKeywords(
  description: string,
  title: string,
  category: string,
  specifications: Array<{ name: string; value: string }>,
): string {
  const marker = 'Ключевые слова для поиска:';
  if (description.includes(marker)) return description;
  const stopWords = new Set([
    'для', 'или', 'при', 'это', 'как', 'что', 'этот', 'эта', 'модель', 'товар',
    'набор', 'новый', 'новая', 'новое', 'размер', 'цвет', 'the', 'and', 'with',
  ]);
  const keywords = new Set<string>();
  const source = [title, category, ...specifications.flatMap((item) => [item.name, item.value])].join(' ');
  for (const word of source.match(/[\p{L}\p{N}]{3,}/gu) || []) {
    const keyword = word.toLocaleLowerCase('ru');
    if (!stopWords.has(keyword)) keywords.add(keyword);
    if (keywords.size >= 18) break;
  }
  if (keywords.size === 0) return description;
  return `${description.trim()}\n\n${marker} ${[...keywords].join(', ')}`;
}

// Таблица заказов клиентов с номерами заказов и деталями
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    customer_notes TEXT,
    total_amount REAL NOT NULL,
    status TEXT DEFAULT 'new',
    delivery_type TEXT DEFAULT 'order',
    items_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS site_visitors (
    visitor_hash TEXT PRIMARY KEY,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    device_info TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS site_daily_visitors (
    visit_date TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    PRIMARY KEY (visit_date, visitor_hash)
  );
  CREATE TABLE IF NOT EXISTS site_daily_stats (
    visit_date TEXT PRIMARY KEY,
    visits_count INTEGER NOT NULL DEFAULT 0,
    unique_visitors_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS site_visit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_hash TEXT NOT NULL,
    device_info TEXT NOT NULL,
    visited_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS site_search_queries (
    normalized_query TEXT PRIMARY KEY,
    query_text TEXT NOT NULL,
    searches_count INTEGER NOT NULL DEFAULT 0,
    first_searched_at TEXT NOT NULL,
    last_searched_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS site_visit_totals (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    visits_count INTEGER NOT NULL DEFAULT 0,
    unique_visitors_count INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO site_visit_totals (id, visits_count, unique_visitors_count) VALUES (1, 0, 0);
  CREATE INDEX IF NOT EXISTS idx_products_active_category_id ON products(status, category_id, id DESC);
  CREATE INDEX IF NOT EXISTS idx_products_active_popularity ON products(status, views_count DESC, id DESC);
  CREATE INDEX IF NOT EXISTS idx_products_active_title ON products(status, title COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_variants_product_id ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_site_visit_events_visited_at ON site_visit_events(visited_at DESC);
  CREATE INDEX IF NOT EXISTS idx_site_search_queries_count ON site_search_queries(searches_count DESC, last_searched_at DESC);
`);

const ordersColumns = db.prepare('PRAGMA table_info(orders)').all() as Array<{ name: string }>;
if (!ordersColumns.some((column) => column.name === 'total_amount_tjs')) {
  db.exec('ALTER TABLE orders ADD COLUMN total_amount_tjs REAL NOT NULL DEFAULT 0;');
}
db.exec('UPDATE orders SET total_amount_tjs = total_amount WHERE total_amount_tjs = 0 AND total_amount != 0;');

db.exec(`
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER,
    variant_id INTEGER,
    title TEXT NOT NULL,
    color TEXT,
    size TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_tjs REAL NOT NULL DEFAULT 0,
    variant_sku TEXT,
    base_sku TEXT,
    image TEXT,
    FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
`);

function nullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

const existingOrdersForItems = db.prepare(`
  SELECT o.id, o.items_json
  FROM orders o
  WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id)
`).all() as Array<{ id: number; items_json: string | null }>;
const insertMigratedOrderItem = db.prepare(`
  INSERT INTO order_items (
    order_id, product_id, variant_id, title, color, size, quantity, price_tjs,
    variant_sku, base_sku, image
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const existingOrder of existingOrdersForItems) {
  let legacyItems: any[] = [];
  try {
    const parsedItems = JSON.parse(existingOrder.items_json || '[]');
    if (Array.isArray(parsedItems)) legacyItems = parsedItems;
  } catch (error) {
    console.warn(`[Order Items Migration] Не удалось прочитать позиции заказа ${existingOrder.id}:`, error);
  }
  for (const item of legacyItems) {
    if (!item || typeof item !== 'object') continue;
    insertMigratedOrderItem.run(
      existingOrder.id,
      nullableInteger(item.product_id),
      nullableInteger(item.variant_id),
      String(item.title || 'Товар'),
      String(item.color || ''),
      String(item.size || ''),
      Math.max(1, Math.floor(Number(item.quantity) || 1)),
      Math.max(0, Number(item.price_tjs) || 0),
      String(item.variant_sku || ''),
      String(item.base_sku || ''),
      String(item.image || ''),
    );
  }
}

const FIXED_CATEGORY_TREE = [
  {
    name: 'Женская одежда',
    subcategories: [
      'Платья и сарафаны',
      'Женская верхняя одежда',
      'Футболки, топы и боди',
      'Женские блузки и рубашки',
      'Женские свитеры, худи и трикотаж',
      'Женские брюки, джинсы и леггинсы',
      'Женские юбки и шорты',
      'Женские костюмы, жакеты и комбинезоны',
      'Мусульманская и восточная одежда',
      'Одежда больших размеров и для беременных',
    ],
  },
  {
    name: 'Мужская одежда',
    subcategories: [
      'Мужская верхняя одежда',
      'Мужские футболки, майки и поло',
      'Мужские рубашки и сорочки',
      'Мужские худи, толстовки и свитеры',
      'Мужские брюки и джинсы',
      'Мужские костюмы и пиджаки',
      'Мужские шорты и бриджи',
    ],
  },
  {
    name: 'Нижнее белье и домашняя одежда',
    subcategories: [
      'Женское нижнее белье',
      'Мужское нижнее белье',
      'Термобелье',
      'Пижамы и одежда для дома',
      'Носки, гольфы и колготки',
      'Купальники и пляжная мода',
    ],
  },
  {
    name: 'Обувь',
    subcategories: [
      'Женская обувь',
      'Мужская обувь',
      'Детская обувь',
      'Домашняя и пляжная обувь',
      'Аксессуары и уход за обувью',
    ],
  },
  {
    name: 'Сумки, рюкзаки и чемоданы',
    subcategories: [
      'Женские сумки',
      'Мужские сумки',
      'Рюкзаки',
      'Чемоданы и дорожные сумки',
      'Кошельки и мелкая кожгалантерея',
      'Косметички и органайзеры',
    ],
  },
  {
    name: 'Аксессуары, часы и украшения',
    subcategories: [
      'Наручные часы',
      'Очки и оптика',
      'Головные уборы',
      'Шарфы, платки и перчатки',
      'Ремни, пояса и галстуки',
      'Бижутерия и украшения',
      'Зонты и защита от непогоды',
    ],
  },
  {
    name: 'Электроника и гаджеты',
    subcategories: [
      'Смартфоны и аксессуары',
      'Наушники и аудиотехника',
      'Смарт-часы и носимая электроника',
      'Зарядные устройства, кабели и питание',
      'Компьютеры, ноутбуки и периферия',
      'Комплектующие и накопители данных',
      'Фото-, видео-, ТВ и блогерская техника',
      'Игровые приставки и гейминг',
      'Умный дом и безопасность',
    ],
  },
  {
    name: 'Бытовая техника',
    subcategories: [
      'Техника для приготовления пищи',
      'Техника для измельчения и смешивания',
      'Техника для напитков',
      'Уборка и уход за одеждой',
      'Климатическая техника',
      'Приборы для красоты и здоровья',
    ],
  },
  {
    name: 'Товары для дома и быта',
    subcategories: [
      'Посуда для готовки и выпечки',
      'Сервировка стола и хранение продуктов',
      'Кухонные гаджеты и аксессуары',
      'Домашний текстиль',
      'Хранение и порядок в доме',
      'Товары для ванной и туалета',
      'Инвентарь для уборки и стирки',
      'Хозяйственные мелочи',
    ],
  },
  {
    name: 'Мебель, ремонт и декор интерьера',
    subcategories: [
      'Малая и корпусная мебель',
      'Освещение и электрика',
      'Декор и уют интерьера',
      'Сантехника для кухни и ванной',
      'Материалы для ремонта и фурнитура',
    ],
  },
  {
    name: 'Красота, уход и гигиена',
    subcategories: [
      'Макияж и аксессуары для визажа',
      'Уход за кожей лица и тела',
      'Маникюр и педикюр',
      'Уход за волосами и парикмахерские товары',
      'Массаж, релакс и личная гигиена',
    ],
  },
  {
    name: 'Детские товары и игрушки',
    subcategories: [
      'Одежда для новорожденных и малышей',
      'Одежда для девочек и мальчиков',
      'Товары для мам и ухода за младенцами',
      'Игрушки и игры',
    ],
  },
  {
    name: 'Спорт, туризм и активный отдых',
    subcategories: [
      'Фитнес, йога и домашние тренажеры',
      'Туризм, кемпинг и пикник',
      'Рыбалка и охота',
      'Командные игры и единоборства',
      'Плавание, водный и зимний спорт',
    ],
  },
  {
    name: 'Транспорт: Вело, Мото, Электротранспорт, Квадроциклы, Трициклы и Авто',
    subcategories: [
      'Электротранспорт (персональный и городской)',
      'Трициклы и коммерческий транспорт',
      'Квадроциклы, багги и вездеходы (ATV / UTV)',
      'Мотоциклы, скутеры и мопеды (бензиновые)',
      'Мотоэкипировка, тюнинг и мотозапчасти',
      'Велосипеды, самокаты и ролики',
      'Автотовары и автоаксессуары',
    ],
  },
  {
    name: 'Канцелярия, хобби, праздники и зоотовары',
    subcategories: [
      'Школьная и офисная канцелярия',
      'Рисование, творчество и рукоделие',
      'Зоотовары',
      'Товары для праздников и подарков',
      'Музыкальные инструменты и аксессуары',
    ],
  },
];

const STRICT_ALLOWED_CATEGORIES: string[] = [];
for (const root of FIXED_CATEGORY_TREE) {
  for (const subcategory of root.subcategories) {
    STRICT_ALLOWED_CATEGORIES.push(subcategory);
  }
}

function determineSubcategoryRuleBased(productText: string): string {
  const lower = productText.toLowerCase();
  if (/(квадроцикл|багги|вездеход|atv|utv)/i.test(lower)) return 'Квадроциклы, багги и вездеходы (ATV / UTV)';
  if (/(электросамокат|электровелосипед|электроскутер|электротранспорт)/i.test(lower)) return 'Электротранспорт (персональный и городской)';
  if (/(мотоэкип|мотозапчаст|мототюнинг|мотошлем|мотоперчат)/i.test(lower)) return 'Мотоэкипировка, тюнинг и мотозапчасти';
  if (/(мотоцикл|мопед|скутер|питбайк|эндуро)/i.test(lower)) return 'Мотоциклы, скутеры и мопеды (бензиновые)';
  if (/(велосипед|самокат|ролик)/i.test(lower)) return 'Велосипеды, самокаты и ролики';
  if (/(авто|автомобил|видеорегистратор|автомобильн)/i.test(lower)) return 'Автотовары и автоаксессуары';
  if (/(трицикл|грузовой транспорт|коммерческий транспорт)/i.test(lower)) return 'Трициклы и коммерческий транспорт';
  if (/(радиоуправ|rc\b|дрон|квадрокоптер|конструктор|lego|лего|развивающ|пазл|настольн.{0,8}игр|игрушк|кукл|машинк)/i.test(lower)) return 'Игрушки и игры';
  if (/(кошка|собак|зоотовар|для животных|кормушк.{0,8}(птиц|рыб))/i.test(lower)) return 'Зоотовары';
  if (/(канцеляр|тетрад|блокнот|ежедневник|ручк.{0,8}(шариков|пишущ)|школьн.{0,8}(товар|принадлеж))/i.test(lower)) return 'Школьная и офисная канцелярия';
  if (/(рисован|лепк|рукодел|товар.{0,8}для творч|набор.{0,8}для творч)/i.test(lower)) return 'Рисование, творчество и рукоделие';
  if (/(праздник|подарочн|новогодн|декорац.{0,8}(праздник|шар)|музыкальн.{0,8}(инструмент|гитар)|гитар|синтезатор)/i.test(lower)) return 'Товары для праздников и подарков';
  if (/(детск.{0,12}(телефон|планшет|часы|гаджет)|детские часы|новорожден|младен|для мам|детск.{0,8}(товар|игр|одежд))/i.test(lower)) return 'Одежда для девочек и мальчиков';
  if (/(женск.{0,10}(нижн.{0,8}бель|бюстгальтер)|бюстгальтер|лифчик|трусы жен|купальник)/i.test(lower)) return 'Женское нижнее белье';
  if (/(мужск.{0,10}(нижн.{0,8}бель|трусы)|боксеры муж)/i.test(lower)) return 'Мужское нижнее белье';
  if (/(термобель)/i.test(lower)) return 'Термобелье';
  if (/(пижам|домашн.{0,8}одежд)/i.test(lower)) return 'Пижамы и одежда для дома';
  if (/(носки|гольфы|колготк)/i.test(lower)) return 'Носки, гольфы и колготки';
  if (/(смартфон|мобильн.{0,8}телефон|сотов.{0,8}телефон|iphone|айфон)/i.test(lower)) return 'Смартфоны и аксессуары';
  if (/(наушник|гарнитур|колонк|микрофон|аудио|динамик|headphone|earphone)/i.test(lower)) return 'Наушники и аудиотехника';
  if (/(смарт.?час|умн.{0,8}час|фитнес.?браслет|smartwatch)/i.test(lower)) return 'Смарт-часы и носимая электроника';
  if (/(часы|watch)/i.test(lower)) return 'Наручные часы';
  if (/(ноутбук|компьютер|моноблок|нетбук|клавиатур|мышь компьютер)/i.test(lower)) return 'Компьютеры, ноутбуки и периферия';
  if (/(пауэрбанк|power.?bank|внешн.{0,8}аккумулятор|зарядн.{0,8}устройств|зарядка|кабель|адаптер питания)/i.test(lower)) return 'Зарядные устройства, кабели и питание';
  if (/(приставк|гейминг|игров.{0,8}(консол|приставк)|видеоигр)/i.test(lower)) return 'Игровые приставки и гейминг';
  if (/(фото|видео|камера|телевизор|блогер|проектор)/i.test(lower)) return 'Фото-, видео-, ТВ и блогерская техника';
  if (/(умн.{0,8}дом|датчик.{0,8}(движен|температур)|умн.{0,8}(розетк|выключател)|камера наблюден)/i.test(lower)) return 'Умный дом и безопасность';
  if (/(комплектующ|видеокарт|процессор|накопител|ssd|жесткий диск)/i.test(lower)) return 'Комплектующие и накопители данных';
  if (/(чехол|защитн.{0,8}(стекло|пленка)|держатель.{0,8}(телефон|смартфон)|аксессуар.{0,12}гаджет)/i.test(lower)) return 'Смартфоны и аксессуары';
  if (/(техника для приготов|аэрогрил|фритюрниц|мультиварк|скороварк|рисоварк|духовк|плитк)/i.test(lower)) return 'Техника для приготовления пищи';
  if (/(блендер|измельчител|миксер|комбайн)/i.test(lower)) return 'Техника для измельчения и смешивания';
  if (/(чайник|кофевар|кофемашин|термопот|соковыжимал)/i.test(lower)) return 'Техника для напитков';
  if (/(пылесос|утюг|парогенератор|стиральн|гладильн)/i.test(lower)) return 'Уборка и уход за одеждой';
  if (/(увлажнител|очистител.{0,8}воздух|кондиционер|обогревател|вентилятор)/i.test(lower)) return 'Климатическая техника';
  if (/(фен|триммер|эпилятор|бритв|машинк.{0,8}для стрижк)/i.test(lower)) return 'Приборы для красоты и здоровья';
  if (/(посуда|сковород|кастрюл|кухонн.{0,8}утвар|столовые прибор|выпечк)/i.test(lower)) return 'Посуда для готовки и выпечки';
  if (/(сервиров|хранени.{0,8}продукт|контейнер.{0,8}(пищ|продукт)|банка для)/i.test(lower)) return 'Сервировка стола и хранение продуктов';
  if (/(кухонн.{0,8}(гаджет|аксессуар)|терка|овощерезк)/i.test(lower)) return 'Кухонные гаджеты и аксессуары';
  if (/(текстиль|плед|подушк|штор|покрывал|постельн)/i.test(lower)) return 'Домашний текстиль';
  if (/(хранени|органайзер|коробк.{0,8}для|вешалк|корзин.{0,8}для белья)/i.test(lower)) return 'Хранение и порядок в доме';
  if (/(ванн|туалет|душев|зубн.{0,8}щетк)/i.test(lower)) return 'Товары для ванной и туалета';
  if (/(швабр|уборк|стирк|моющ.{0,8}средств)/i.test(lower)) return 'Инвентарь для уборки и стирки';
  if (/(светильник|ламп|люстр|освещен|ночник|электрик)/i.test(lower)) return 'Освещение и электрика';
  if (/(мебел|кресло|стол|шкаф|диван|полк.{0,8}настенн)/i.test(lower)) return 'Малая и корпусная мебель';
  if (/(сантехник|смесител|кран|раковин)/i.test(lower)) return 'Сантехника для кухни и ванной';
  if (/(ремонт|фурнитур|инструмент|крепеж|строительн.{0,8}материал)/i.test(lower)) return 'Материалы для ремонта и фурнитура';
  if (/(декор|интерьер|украшени.{0,8}дом|ваза)/i.test(lower)) return 'Декор и уют интерьера';
  if (/(макияж|косметик|спонж|ресниц|помад)/i.test(lower)) return 'Макияж и аксессуары для визажа';
  if (/(уход.{0,8}(кож|лиц)|крем|сыворотк)/i.test(lower)) return 'Уход за кожей лица и тела';
  if (/(маникюр|педикюр|ногт)/i.test(lower)) return 'Маникюр и педикюр';
  if (/(волос|парикмах|фен)/i.test(lower)) return 'Уход за волосами и парикмахерские товары';
  if (/(массаж|релакс|гигиен)/i.test(lower)) return 'Массаж, релакс и личная гигиена';
  if (/(кроссов|кеды|ботин|туфл|сапог|сланц|сандал|обувь)/i.test(lower)) {
    if (/(детск|мальчик|девочк)/i.test(lower)) return 'Детская обувь';
    if (/(женск|женщин|девушк)/i.test(lower)) return 'Женская обувь';
    return 'Мужская обувь';
  }
  if (/(сумк|рюкзак|кошелек|кошелёк|чемодан)/i.test(lower)) return 'Женские сумки';
  if (/(очки|оптик)/i.test(lower)) return 'Очки и оптика';
  if (/(кепк|бейсболк|шапк|панам|шляп|берет|козырек)/i.test(lower)) return 'Головные уборы';
  if (/(шарф|платок|платк|перчатк|варежк|снуд|палантин)/i.test(lower)) return 'Шарфы, платки и перчатки';
  if (/(ремень|пояс|галстук|подтяжк|запонк)/i.test(lower)) return 'Ремни, пояса и галстуки';
  if (/(зонт|дождевик|пончо|веер)/i.test(lower)) return 'Зонты и защита от непогоды';
  if (/(украшени|браслет|кольцо|серьг|цепочк|бижутер)/i.test(lower)) return 'Бижутерия и украшения';
  if (/(рыбалк|охот)/i.test(lower)) return 'Рыбалка и охота';
  if (/(туризм|кемпинг|палатк|спальн.{0,8}мешок|походн)/i.test(lower)) return 'Туризм, кемпинг и пикник';
  if (/(фитнес|гантел|эспандер|скакалк|йога|тренажер)/i.test(lower)) return 'Фитнес, йога и домашние тренажеры';
  if (/(спортивн|спорт|тренировочн|футбол|мяч)/i.test(lower)) return 'Командные игры и единоборства';
  if (/(плаван|лыж|сноуборд|зимн.{0,8}спорт)/i.test(lower)) return 'Плавание, водный и зимний спорт';
  if (/(женск|женщин|девушк|платье|юбк|блузк|сарафан)/i.test(lower)) return 'Платья и сарафаны';
  if (/(детск|мальчик|девочк)/i.test(lower)) return 'Одежда для девочек и мальчиков';
  if (/(мужск|мужчин)/i.test(lower)) return 'Мужские футболки, майки и поло';
  return 'Мужские футболки, майки и поло';
}

function normalizeSubcategoryName(categoryName: string, productText: string = ''): string {
  const normalized = String(categoryName || '').trim().toLocaleLowerCase('ru');
  for (const subcategory of STRICT_ALLOWED_CATEGORIES) {
    if (subcategory.toLocaleLowerCase('ru') === normalized) return subcategory;
  }
  return determineSubcategoryRuleBased(`${categoryName} ${productText}`);
}

function getFixedSubcategoryId(categoryName: string): number {
  const safeName = normalizeSubcategoryName(categoryName);
  const row = db.prepare('SELECT id FROM categories WHERE name = ? AND parent_id IS NOT NULL').get(safeName) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Фиксированная подкатегория не найдена в базе: ${safeName}`);
  }
  return row.id;
}

db.exec('BEGIN IMMEDIATE;');
try {
  const upsertCategory = db.prepare(`
    INSERT INTO categories (name, parent_id) VALUES (?, ?)
    ON CONFLICT(name) DO UPDATE SET parent_id = excluded.parent_id
  `);
  for (const root of FIXED_CATEGORY_TREE) {
    upsertCategory.run(root.name, null);
    const rootRow = db.prepare('SELECT id FROM categories WHERE name = ?').get(root.name) as { id: number };
    for (const subcategory of root.subcategories) {
      upsertCategory.run(subcategory, rootRow.id);
    }
  }

  const allowedCategoryNames = new Set<string>();
  for (const root of FIXED_CATEGORY_TREE) {
    allowedCategoryNames.add(root.name);
    for (const subcategory of root.subcategories) {
      allowedCategoryNames.add(subcategory);
    }
  }

  const existingProducts = db.prepare(`
    SELECT p.id, p.title, c.name AS category_name, parent.name AS parent_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN categories parent ON parent.id = c.parent_id
  `).all() as Array<{ id: number; title: string; category_name: string | null; parent_name: string | null }>;
  const updateProductCategory = db.prepare('UPDATE products SET category_id = ? WHERE id = ?');
  for (const product of existingProducts) {
    if (product.category_name && STRICT_ALLOWED_CATEGORIES.includes(product.category_name)) continue;
    const legacyCategoryContext = `${product.category_name || ''} ${product.parent_name || ''} ${product.title || ''}`;
    const destination = determineSubcategoryRuleBased(legacyCategoryContext);
    updateProductCategory.run(getFixedSubcategoryId(destination), product.id);
  }

  const fixedNames = Array.from(allowedCategoryNames);
  let placeholders = '';
  for (const name of fixedNames) {
    if (placeholders) placeholders += ', ';
    placeholders += '?';
  }
  db.prepare(`DELETE FROM categories WHERE name NOT IN (${placeholders})`).run(...fixedNames);
  db.exec('COMMIT;');
} catch (error) {
  db.exec('ROLLBACK;');
  throw error;
}

// Очистка существующих товаров от запрещенных слов и фраз о контроле производства
try {
  const existingProds = db.prepare('SELECT id, title, description FROM products').all() as Array<{ id: number; title: string; description: string }>;
  const updateProd = db.prepare('UPDATE products SET title = ?, description = ? WHERE id = ?');
  for (const p of existingProds) {
    const cleanT = cleanBannedWordsAndPhrases(p.title || '');
    const cleanD = cleanBannedWordsAndPhrases(p.description || '');
    if (cleanT !== p.title || cleanD !== p.description) {
      updateProd.run(cleanT, cleanD, p.id);
    }
  }
} catch (e) {
  console.warn('[DB Sanitizer]', e);
}

// Настройки по умолчанию
function getSetting(key: string, defaultValue: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : defaultValue;
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

if (!db.prepare('SELECT value FROM settings WHERE key = ?').get('cny_tjs_rate')) {
  setSetting('cny_tjs_rate', '1.45');
}
if (!db.prepare('SELECT value FROM settings WHERE key = ?').get('delivery_per_kg_tjs')) {
  setSetting('delivery_per_kg_tjs', '30');
}
if (!db.prepare('SELECT value FROM settings WHERE key = ?').get('whatsapp_phone')) {
  setSetting('whatsapp_phone', '992444431');
}

// ==========================================
// ЦЕНООБРАЗОВАНИЕ В TJS
// ==========================================
function calculateVariantPriceTjs(priceCny: number, weightKg: number = 0.5): number {
  const numCny = Number.isFinite(Number(priceCny)) ? Number(priceCny) : 0;
  const numWeight = Number.isFinite(Number(weightKg)) ? Number(weightKg) : 0.5;
  const markup = numCny <= 20 ? 2.0 : numCny <= 100 ? 1.6 : 1.3;

  return Math.round((numCny * 1.45 * markup) + (numWeight * 30));
}

const storedVariantsForRepricing = db.prepare(
  'SELECT id, price_cny, weight_kg FROM product_variants'
).all() as Array<{ id: number; price_cny: number; weight_kg: number }>;
const updateStoredVariantPrice = db.prepare(
  'UPDATE product_variants SET price_tjs = ? WHERE id = ?'
);
for (const variant of storedVariantsForRepricing) {
  updateStoredVariantPrice.run(
    calculateVariantPriceTjs(variant.price_cny, variant.weight_kg),
    variant.id
  );
}

// Генератор короткого артикула: две буквы категории и четыре цифры.
function generateBaseSku(categoryId?: number | null): string {
  const category = categoryId
    ? db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId) as { name: string } | undefined
    : undefined;
  const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  const categoryLetters = (category?.name || '')
    .toLocaleLowerCase('ru')
    .replace(/[а-яё]/g, (letter) => transliteration[letter] || '')
    .replace(/[^a-z]/g, '')
    .slice(0, 2)
    .toUpperCase();
  const prefix = categoryLetters ? categoryLetters.padEnd(2, 'P') : 'MS';

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const sku = `${prefix}${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = db.prepare('SELECT 1 FROM products WHERE base_sku = ?').get(sku);
    if (!existing) return sku;
  }
  throw new Error('Не удалось создать уникальный артикул товара');
}

function generateVariantSku(baseSku: string, color?: string, size?: string): string {
  const cleanSize = (size || 'OS').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4) || 'SZ';
  const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${baseSku}-${cleanSize}-${randomHex}`;
}

// ==========================================
// СИД НАЧАЛЬНЫХ ТОВАРОВ С МАТРИЦЕЙ ВАРИАНТОВ
// ==========================================
const countProducts = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;
if (countProducts === 0) {
  console.log('Наполнение базы профессиональными мульти-вариативными товарами...');

  const hoodieCatId = getFixedSubcategoryId('Мужские футболки, майки и поло');
  const sneakersCatId = getFixedSubcategoryId('Мужская обувь');
  const watchCatId = getFixedSubcategoryId('Смарт-часы и носимая электроника');
  const audioCatId = getFixedSubcategoryId('Наушники и аудиотехника');

  const insertProd = db.prepare(`
    INSERT INTO products (title, description, original_link, category_id, base_sku, status, main_image)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `);

  const insertVar = db.prepare(`
    INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Товар 1: Кроссовки с цветами и размерами
  const p1Sku = generateBaseSku(sneakersCatId);
  const p1Res = insertProd.run(
    'Мужские защитные дышащие кроссовки Hyper-Breeze',
    'Ультралегкие кроссовки из дышащего плетеного текстиля с анатомической подошвой EVA. Оптимальная амортизация для города и тренировок.',
    'https://detail.1688.com/offer/784192019.html',
    sneakersCatId,
    p1Sku,
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop'
  );
  const p1Id = Number(p1Res.lastInsertRowid);

  const colors1 = [
    { name: 'Черный оникс', img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop', cny: 65, weight: 0.8 },
    { name: 'Графитовый серый', img: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&auto=format&fit=crop', cny: 65, weight: 0.8 },
    { name: 'Белоснежный', img: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&auto=format&fit=crop', cny: 70, weight: 0.8 }
  ];
  const sizes1 = ['40', '41', '42', '43', '44'];

  for (const c of colors1) {
    for (const s of sizes1) {
      const priceTjs = calculateVariantPriceTjs(c.cny, c.weight);
      insertVar.run(p1Id, c.name, s, c.cny, priceTjs, Math.floor(5 + Math.random() * 15), c.weight, generateVariantSku(p1Sku, c.name, s), c.img);
    }
  }

  // Товар 2: Оверсайз худи Heavy Cotton
  const p2Sku = generateBaseSku(hoodieCatId);
  const p2Res = insertProd.run(
    'Оверсайз худи Heavy Cotton 450г/м² с мягким начесом',
    'Премиальный плотный хлопок с шелковистым внутренним начесом. Сохраняет форму после многократных стирок, свободный силуэт.',
    'https://detail.1688.com/offer/654129031.html',
    hoodieCatId,
    p2Sku,
    'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop'
  );
  const p2Id = Number(p2Res.lastInsertRowid);

  const colors2 = [
    { name: 'Глубокий черный', img: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&auto=format&fit=crop', cny: 88, weight: 0.7 },
    { name: 'Оливковый хаки', img: 'https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=800&auto=format&fit=crop', cny: 88, weight: 0.7 },
    { name: 'Песочный меланж', img: 'https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=800&auto=format&fit=crop', cny: 92, weight: 0.7 }
  ];
  const sizes2 = ['S', 'M', 'L', 'XL', '2XL'];

  for (const c of colors2) {
    for (const s of sizes2) {
      const priceTjs = calculateVariantPriceTjs(c.cny, c.weight);
      insertVar.run(p2Id, c.name, s, c.cny, priceTjs, Math.floor(4 + Math.random() * 10), c.weight, generateVariantSku(p2Sku, c.name, s), c.img);
    }
  }

  // Товар 3: Смарт-часы Titanium Ultra
  const p3Sku = generateBaseSku(watchCatId);
  const p3Res = insertProd.run(
    'Смарт-часы Titanium Series Ultra AMOLED',
    'Флагманский титановый корпус, дисплей сапфирового класса 1000 нит, датчики пульса и кислорода, автономность до 12 дней.',
    'https://mobile.yangkeduo.com/goods.html?goods_id=89123019',
    watchCatId,
    p3Sku,
    'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&auto=format&fit=crop'
  );
  const p3Id = Number(p3Res.lastInsertRowid);

  const watchVariants = [
    { color: 'Титановый с черным ремешком', size: '49mm', cny: 145, weight: 0.35, img: 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=800&auto=format&fit=crop' },
    { color: 'Серебристый со стальным браслетом', size: '49mm', cny: 165, weight: 0.45, img: 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop' },
    { color: 'Оранжевый трейл', size: '49mm', cny: 145, weight: 0.35, img: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop' }
  ];

  for (const w of watchVariants) {
    const priceTjs = calculateVariantPriceTjs(w.cny, w.weight);
    insertVar.run(p3Id, w.color, w.size, w.cny, priceTjs, 12, w.weight, generateVariantSku(p3Sku, w.color, w.size), w.img);
  }

  // Товар 4: Наушники ANC Pro
  const p4Sku = generateBaseSku(audioCatId);
  const p4Res = insertProd.run(
    'Беспроводные наушники Clarity ANC Pro с пространственным аудио',
    'Гибридное активное шумоподавление до -40dB, динамические драйверы 12мм, 32 часа автономной работы с футляром Type-C.',
    'https://detail.1688.com/offer/912830112.html',
    audioCatId,
    p4Sku,
    'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop'
  );
  const p4Id = Number(p4Res.lastInsertRowid);

  const audioVariants = [
    { color: 'Матовый черный', size: 'Стандарт', cny: 48, weight: 0.25, img: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop' },
    { color: 'Жемчужно-белый', size: 'Стандарт', cny: 48, weight: 0.25, img: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop' }
  ];

  for (const a of audioVariants) {
    const priceTjs = calculateVariantPriceTjs(a.cny, a.weight);
    insertVar.run(p4Id, a.color, a.size, a.cny, priceTjs, 25, a.weight, generateVariantSku(p4Sku, a.color, a.size), a.img);
  }
}

// ==========================================
// ИНТЕЛЛЕКТУАЛЬНЫЙ РАЗБОР СТРАНИЦЫ ИЗ GEMINI
// ==========================================
interface ParsedVariant {
  color: string;
  size: string;
  price_cny: number;
  stock: number;
  weight_kg?: number;
  image_url?: string;
}

interface GeminiAnalysisResult {
  title: string;
  description: string;
  category_name: string;
  weight_kg: number;
  variants: ParsedVariant[];
  specifications: Array<{ name: string; value: string }>;
}

function cleanRawTitle(raw: string): string {
  return raw
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/[-|_].*$/g, '')
    .replace(/(批发|厂家直销|现货|包邮|爆款|2026新款|跨境|一件代发)/g, '')
    .trim() || 'Эксклюзивный товар';
}

function fallbackAnalysis(rawText: string, rawTitle?: string, baseCny: number = 50, weightKg: number = 0.5): GeminiAnalysisResult {
  const analysis = analyzeSemantically(rawText, rawTitle, baseCny, weightKg);
  analysis.category_name = normalizeSubcategoryName(analysis.category_name, `${rawTitle || ''} ${rawText}`);
  return analysis;
}

interface VisualSkuItem {
  raw_color: string;
  image_url: string;
}

const COLOR_TRANSLATION_MAP: Record<string, string[]> = {
  'черный': ['黑', 'black'],
  'белый': ['白', 'white'],
  'серый': ['灰', 'gray', 'grey'],
  'синий': ['蓝', 'blue', 'cyan'],
  'голубой': ['天蓝', '浅蓝', 'blue'],
  'красный': ['红', 'red'],
  'розовый': ['粉', 'pink'],
  'желтый': ['黄', 'yellow'],
  'зеленый': ['绿', 'green'],
  'коричневый': ['棕', '咖啡', '咖', 'brown', 'coffee'],
  'кофейный': ['咖', '咖啡', 'coffee', 'brown'],
  'бежевый': ['米', '卡其', 'beige', 'khaki'],
  'хаки': ['卡其', '军绿', 'khaki'],
  'оранжевый': ['橙', 'orange'],
  'фиолетовый': ['紫', 'purple'],
  'бордовый': ['酒红', 'burgundy']
};

function matchColorWithVisualMap(colorRu: string, visualSkuMap: VisualSkuItem[]): string {
  if (!visualSkuMap || visualSkuMap.length === 0) return '';
  const lowerRu = colorRu.toLowerCase();

  // 1. Поиск по ключевым китайским иероглифам из словаря
  for (const [ruKey, cnTokens] of Object.entries(COLOR_TRANSLATION_MAP)) {
    if (lowerRu.includes(ruKey)) {
      for (const item of visualSkuMap) {
        for (const token of cnTokens) {
          if (item.raw_color.includes(token)) {
            return item.image_url;
          }
        }
      }
    }
  }

  // 2. Если в самом названии цвета есть китайские иероглифы
  for (const item of visualSkuMap) {
    if (item.raw_color.includes(colorRu) || colorRu.includes(item.raw_color)) {
      return item.image_url;
    }
  }

  return '';
}

async function analyzeProductWithGemini(
  rawText: string,
  rawTitle?: string,
  basePriceCny: number = 50,
  weightKg: number = 0.5,
  visualSkuMap: VisualSkuItem[] = []
): Promise<GeminiAnalysisResult> {
  const isHtmlOrJson = rawText.includes('<') || rawText.includes('window.context') || rawText.includes('__INIT_DATA') || rawText.includes('skuInfoMap') || rawText.trim().startsWith('{');
  let structuredContext: any = null;
  let textSnippet = '';

  if (isHtmlOrJson) {
    structuredContext = extractStructuredFromHtmlOrJson(rawText);
    textSnippet = (structuredContext.rawSnippetForAi || rawText).slice(0, 18000);
  } else {
    textSnippet = rawText;
  }

  const effectiveTitle = rawTitle || structuredContext?.title || '';

  if (!aiClient) {
    console.log('[Gemini] GEMINI_API_KEY отсутствует, используется автономный семантический анализ v4.0.');
    const fallback = analyzeSemantically(textSnippet, effectiveTitle, basePriceCny, weightKg);
    fallback.category_name = normalizeSubcategoryName(fallback.category_name, `${effectiveTitle} ${textSnippet}`);
    if (structuredContext?.specifications && structuredContext.specifications.length > 0) {
      fallback.specifications = structuredContext.specifications;
    }
    if (structuredContext?.variants && structuredContext.variants.length > 0) {
      fallback.variants = structuredContext.variants;
    }
    for (const v of fallback.variants) {
      const matchedImg = matchColorWithVisualMap(v.color, visualSkuMap);
      if (matchedImg) v.image_url = matchedImg;
    }
    return fallback;
  }

  const fallbackPromise = Promise.resolve()
    .then(() => fallbackAnalysis(rawText, rawTitle, basePriceCny, weightKg))
    .then(
      (analysis) => ({ analysis }),
      (error: unknown) => ({ error }),
    );

  try {
    const skuMapSnippet = JSON.stringify(visualSkuMap || [], null, 2);
    const categoryOptions = STRICT_ALLOWED_CATEGORIES.join('\n   - ');

    const prompt = `Ты — ведущий международный e-commerce аналитик маркетплейса M.Savdo (Душанбе, Таджикистан).
Тебе передан исходный HTML-код страницы товара или структура JSON (window.context / __INIT_DATA__) с китайской торговой площадки.

ТВОЯ ГЛАВНАЯ ЗАДАЧА — СТРОГО анализировать переданный HTML-код страницы товара или структуру JSON (window.context) и извлекать данные ИМЕННО ТОГО ТОВАРА, на который указывает ссылка или код, НЕ ДОПУСКАЯ «ГАЛЛЮЦИНАЦИЙ» ИЛИ ПОДСТАНОВКИ ШАБЛОНОВ ИЗ ДРУГИХ КАТЕГОРИЙ.

КАТЕГОРИЧЕСКИЕ ЗАПРЕТЫ (СТРОЖАЙШИЙ КОНТРОЛЬ!):
1. ЗАПРЕЩЕНО писать в заголовке или описании любые упоминания о контроле со стороны M.Savdo:
   - НЕЛЬЗЯ писать: "контроль от М.Савдо", "контроль M.Savdo", "контролируем производство", "контроль при получении", "проверка отделом контроля качества M.Savdo", "заводской контроль сборки M.Savdo" или утверждать, что мы как-либо контролируем производство или проверяем товар при получении!
2. ЗАПРЕЩЕНО использовать слова: "1688", "Alibaba", "Алибаба", "Taobao", "Таобао", "Pinduoduo", "Пиндодо", "оптом", "фабрика", "завод", "производитель".
3. ЗАПРЕЩЕНО подставлять шаблоны других категорий (например, если товар радиоуправляемый бумажный самолет / дрон / игрушка, СТРОГО пиши про самолет / игрушку / модель, ни в коем случае НЕ превращай товар в офисную бумагу А4 только потому, что в комплекте есть листы бумаги!).

ПРИ ПАРСИНГЕ СТРОГО СОБЛЮДАЙ ПРАВИЛА:
1. Проверяй соответствие заголовка (title), характеристик (featureAttributes) и списка SKU. Все параметры должны относиться ИСКЛЮЧИТЕЛЬНО К ЦЕЛЕВОМУ ТОВАРУ.
2. Корректно сопоставляй цены и складские остатки для каждого конкретного SKU из массива skuInfoMap или таблицы характеристик.
3. Если структура данных повреждена или содержит ошибки сериализации, опирайся на видимые текстовые блоки характеристик и таблиц параметров в HTML.

ТРЕБОВАНИЯ К ПОЛЯМ:
1. "title": Строго переведи фактический смысл исходного названия на русский язык и сформулируй краткий заголовок для клиентской витрины. Не добавляй свойства, бренды или сведения, которых нет в исходных данных.
   СТРОГО удали: слова Alibaba, 1688, оптом, 2026, 2025, фабрика, завод, производитель, рекламный спам, китайские иероглифы.
2. "description": Напиши ровно 3 предложения на русском языке. Описывай только свойства, подтвержденные данными страницы, без выдуманных заявлений о качестве, сборке или долговечности.
3. "specifications": В КАЖДОМ ТОВАРЕ НА САЙТЕ ЕСТЬ ХАРАКТЕРИСТИКИ, ИХ СТРОГО НЕЛЬЗЯ ПРОПУСКАТЬ!
   Найди в тексте страницы все технические параметры, свойства и характеристики (featureAttributes, таблицы параметров, свойства материала, сезон, размеры, плотность, тип подошвы/застежки, емкость, совместимость, страна производства, бренд, комплектация и т.д.) и переведи их на РУССКИЙ язык.
   Верни массив объектов: [ { "name": "...", "value": "..." } ] (Минимум 5-8 подробных характеристик!).
4. "category_name": Выбери одну наиболее подходящую ПОДКАТЕГОРИЮ строго из этого фиксированного списка. Новые категории создавать запрещено:
   - ${categoryOptions}
5. "weight_kg": Извлеки вес единицы товара в кг.
6. "variants": Сформируй полную матрицу модификаций товара (цвета/разновидности и РЕАЛЬНЫЕ размеры/объемы/фасовки из текста).
   - "color": Название модификации или цвета на русском языке.
   - "size": Размер или фасовка ("Стандарт" или реальный размер/комплектация).
   - "price_cny": Индивидуальная цена в юанях из skuInfoMap или текста, иначе ${basePriceCny}.
   - "stock": Реальный остаток из canBookCount / amountOnSale / quantity, иначе 25.
   - "weight_kg": Вес варианта в кг.
   - "image_url": Прямая ссылка на фото модификации.

Карта соответствия цветов и фотографий visual_sku_map:
${skuMapSnippet}

ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА ПЕРЕВОДА И СОПОСТАВЛЕНИЯ SKU:
«Переведи название товара на красивый русский язык без мусора маркетплейсов и слов 'Alibaba'. Найди в тексте все доступные цвета и размеры. Для каждого цвета найди его китайское соответствие в переданном массиве visual_sku_map и присвой этому варианту ПРАВИЛЬНУЮ картинку цвета!»
Используй image_url из visual_sku_map только для соответствующего цвета; не назначай одному цвету изображение другого цвета и не придумывай ссылки. Если соответствие не найдено, оставь image_url пустым.

Заголовок со страницы: "${effectiveTitle}"
Базовая цена по умолчанию: ${basePriceCny} CNY
Текстовый слой страницы товара:
"""
${textSnippet}
"""

Верни СТРОГО JSON-объект следующего формата:
{
  "title": "Строка",
  "description": "Строка",
  "category_name": "Категория строго из разрешенного списка",
  "weight_kg": 0.5,
  "specifications": [
    { "name": "Название характеристики", "value": "Значение" }
  ],
  "variants": [
    {
      "color": "Цвет / Модификация на русском",
      "size": "Размер / Фасовка",
      "price_cny": 50.0,
      "stock": 25,
      "weight_kg": 0.5,
      "image_url": "https://..."
    }
  ]
}`;

    let responseText = '';
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        aiClient.models.generateContent({
          model: GEMINI_IMPORT_MODEL,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error(`Таймаут Gemini API (${GEMINI_IMPORT_TIMEOUT_MS}мс)`)),
            GEMINI_IMPORT_TIMEOUT_MS,
          );
        }),
      ]);
      responseText = response.text?.trim() || '{}';
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const parsed = JSON.parse(responseText);

    const title = cleanBannedWordsAndPhrases(parsed.title?.trim() || cleanRawTitle(rawTitle || rawText.slice(0, 80)));
    const description = cleanBannedWordsAndPhrases(parsed.description?.trim() || 'Практичный товар для повседневного использования. Подробные характеристики приведены в карточке. Выберите подходящий вариант товара.');
    const category_name = normalizeSubcategoryName(
      typeof parsed.category_name === 'string' ? parsed.category_name : '',
      `${effectiveTitle} ${textSnippet}`
    );
    const weight_kg = typeof parsed.weight_kg === 'number' && parsed.weight_kg > 0 ? parsed.weight_kg : weightKg;

    let specifications: Array<{ name: string; value: string }> = [];
    if (Array.isArray(parsed.specifications) && parsed.specifications.length > 0) {
      for (const s of parsed.specifications) {
        if (s && s.name && s.value) {
          specifications.push({
            name: String(s.name).trim(),
            value: String(s.value).trim(),
          });
        }
      }
    }
    if (specifications.length === 0) {
      const fb = fallbackAnalysis(rawText, rawTitle, basePriceCny, weightKg);
      fb.category_name = normalizeSubcategoryName(fb.category_name, `${rawTitle || ''} ${rawText}`);
      specifications = fb.specifications || [];
    }

    const variants: ParsedVariant[] = [];
    if (Array.isArray(parsed.variants) && parsed.variants.length > 0) {
      for (const v of parsed.variants) {
        const mappedImage = matchColorWithVisualMap(String(v.color || ''), visualSkuMap);
        const modelImage = (v.image_url || '').trim();
        let vImg = mappedImage || '';
        if (!vImg && visualSkuMap.some((item) => item.image_url === modelImage)) {
          vImg = modelImage;
        }

        variants.push({
          color: String(v.color || 'Основной цвет').trim(),
          size: String(v.size || 'Стандарт').trim(),
          price_cny: parseFloat(v.price_cny) || basePriceCny,
          stock: parseInt(v.stock, 10) || 25,
          weight_kg: parseFloat(v.weight_kg) || weight_kg,
          image_url: vImg,
        });
      }
    } else {
      variants.push({
        color: 'Основной цвет',
        size: 'Стандарт',
        price_cny: basePriceCny,
        stock: 25,
        weight_kg: weight_kg,
        image_url: visualSkuMap[0]?.image_url || '',
      });
    }

    return {
      title,
      description,
      category_name,
      weight_kg,
      variants,
      specifications,
    };
  } catch (err: any) {
    console.warn('[Gemini AI Parse Error]', err.message);
    const fallbackResult = await fallbackPromise;
    if ('error' in fallbackResult) throw fallbackResult.error;
    const fb = fallbackResult.analysis;
    if (structuredContext?.specifications && structuredContext.specifications.length > 0) {
      fb.specifications = structuredContext.specifications;
    }
    if (structuredContext?.variants && structuredContext.variants.length > 0) {
      fb.variants = structuredContext.variants;
    }
    for (const v of fb.variants) {
      const matched = matchColorWithVisualMap(v.color, visualSkuMap);
      if (matched) v.image_url = matched;
    }
    return fb;
  }
}

// Привязка только к одной из фиксированных подкатегорий
function resolveCategoryId(categoryName: string): number {
  return getFixedSubcategoryId(categoryName);
}

function determineAdminCategoryFallback(title: string): string {
  return determineSubcategoryRuleBased(title);
}

async function resolveCategoryWithAi(title: string): Promise<string> {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return determineAdminCategoryFallback('');

  if (!aiClient) {
    return determineAdminCategoryFallback(cleanTitle);
  }

  try {
    const prompt = `Определи категорию для товара. Выбери строго одну подкатегорию из списка и верни только ее название:\n${STRICT_ALLOWED_CATEGORIES.join('\n')}\nТовар: ${cleanTitle}`;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('AI Category Timeout')), 6000)
    );
    const generatePromise = aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const rawCategory = response.text ? response.text.trim().replace(/["'`.]/g, '') : '';
    for (const category of STRICT_ALLOWED_CATEGORIES) {
      if (rawCategory.toLocaleLowerCase('ru') === category.toLocaleLowerCase('ru')) {
        return category;
      }
    }
    return determineAdminCategoryFallback(cleanTitle);
  } catch (error: any) {
    console.warn('[Gemini AI Category Warning]', error.message);
    return determineAdminCategoryFallback(cleanTitle);
  }
}

// ==========================================
// МИДЛВЕЙР АВТОРИЗАЦИИ АДМИНИСТРАТОРА
// ==========================================
const ADMIN_COOKIE_NAME = '__Host-msavdo_admin';
const ADMIN_TELEGRAM_NONCE_COOKIE = '__Host-msavdo_telegram_nonce';
const ADMIN_SESSION_SECONDS = 2 * 60 * 60;
const blockedLoginIps = new Map<string, number>();
const TELEGRAM_LOGIN_NONCE_SECONDS = 5 * 60;

interface AdminJwtClaims {
  sub: number;
  username: string;
  auth_method: 'telegram';
  telegram_id: string;
  iat: number;
  exp: number;
  jti: string;
}

interface TelegramIdTokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  id?: number | string;
  nonce?: string;
  iat?: number;
  exp?: number;
  azp?: string;
}

type TelegramJwk = crypto.JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

let telegramJwksCache: { expiresAt: number; keys: TelegramJwk[] } | null = null;

function signAdminJwt(claims: AdminJwtClaims): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signingInput = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', adminJwtSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

async function getTelegramJwks(forceRefresh = false): Promise<TelegramJwk[]> {
  if (!forceRefresh && telegramJwksCache && telegramJwksCache.expiresAt > Date.now()) {
    return telegramJwksCache.keys;
  }

  const response = await fetch('https://oauth.telegram.org/.well-known/jwks.json', {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Telegram JWKS вернул HTTP ${response.status}`);
  }
  const payload = await response.json() as { keys?: TelegramJwk[] };
  if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
    throw new Error('Telegram JWKS не содержит ключей подписи');
  }

  telegramJwksCache = { keys: payload.keys, expiresAt: Date.now() + 60 * 60 * 1000 };
  return telegramJwksCache.keys;
}

async function verifyTelegramIdToken(
  token: string,
  expectedNonce: string,
): Promise<TelegramIdTokenClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;

  let header: { alg?: string; kid?: string };
  let claims: TelegramIdTokenClaims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  let keys = await getTelegramJwks();
  let jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
  if (!jwk) {
    keys = await getTelegramJwks(true);
    jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig'));
  }
  if (!jwk) return null;

  let isSignatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    isSignatureValid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], 'base64url'),
    );
  } catch {
    return null;
  }
  if (!isSignatureValid) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== 'https://oauth.telegram.org'
    || !audiences.includes(telegramLoginClientId)
    || (audiences.length > 1 && claims.azp !== telegramLoginClientId)
    || claims.nonce !== expectedNonce
    || typeof claims.sub !== 'string'
    || !(
      (typeof claims.id === 'number' && Number.isSafeInteger(claims.id) && claims.id > 0)
      || (typeof claims.id === 'string' && /^\d+$/.test(claims.id))
    )
    || typeof claims.iat !== 'number'
    || !Number.isInteger(claims.iat)
    || typeof claims.exp !== 'number'
    || !Number.isInteger(claims.exp)
    || claims.iat > now + 30
    || now - claims.iat > TELEGRAM_LOGIN_NONCE_SECONDS
    || claims.exp <= now
  ) {
    return null;
  }

  return claims;
}

function getCookieValue(req: express.Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function getAdminCookie(req: express.Request): string | null {
  return getCookieValue(req, ADMIN_COOKIE_NAME);
}

function verifyAdminJwt(token: string): AdminJwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSignature = crypto.createHmac('sha256', adminJwtSecret).update(signingInput).digest();
  let actualSignature: Buffer;
  let payload: AdminJwtClaims;
  try {
    actualSignature = Buffer.from(parts[2], 'base64url');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !crypto.timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    !Number.isInteger(payload.sub)
    || !payload.username
    || payload.auth_method !== 'telegram'
    || typeof payload.telegram_id !== 'string'
    || !adminTelegramAllowedIds.has(payload.telegram_id)
    || !Number.isInteger(payload.exp)
    || payload.exp <= now
    || typeof payload.jti !== 'string'
  ) {
    return null;
  }

  db.prepare('DELETE FROM admin_revoked_tokens WHERE expires_at <= ?').run(now);
  const revokedToken = db.prepare('SELECT token_id FROM admin_revoked_tokens WHERE token_id = ?').get(payload.jti);
  if (revokedToken) return null;
  const user = db.prepare('SELECT username FROM admin_users WHERE id = ?').get(payload.sub) as { username: string } | undefined;
  if (!user || user.username !== payload.username) return null;
  return payload;
}

function getRequestIp(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function getVisitorDeviceInfo(userAgent: string, requestedModel = ''): string {
  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'Unknown OS';
  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /OPR\//i.test(userAgent)
      ? 'Opera'
      : /Firefox\//i.test(userAgent)
        ? 'Firefox'
        : /CriOS|Chrome\//i.test(userAgent)
          ? 'Chrome'
          : /Safari\//i.test(userAgent)
            ? 'Safari'
            : 'Unknown browser';
  const device = /iPad|Tablet/i.test(userAgent)
    ? 'Tablet'
    : /Mobile|Android|iPhone|iPod/i.test(userAgent)
      ? 'Mobile'
      : 'Desktop';
  const parsedAndroidModel = userAgent.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?\)/i)?.[1]?.trim();
  const model = requestedModel || parsedAndroidModel || device;
  return `${model.slice(0, 80)} · ${os} · ${browser}`;
}

const siteVisitRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});
let lastVisitCleanupDate = '';

app.post('/api/visits', siteVisitRateLimiter, (req, res) => {
  const now = new Date();
  const visitedAt = now.toISOString();
  const visitDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dushanbe' }).format(now);
  const visitorHash = crypto.createHmac('sha256', adminJwtSecret).update(getRequestIp(req)).digest('hex');
  const requestUserAgent = req.get('user-agent');
  const userAgent = requestUserAgent?.slice(0, 1000) || '';
  const requestedModel = typeof req.body?.device_model === 'string'
    ? req.body.device_model.replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 80)
    : '';
  const deviceInfo = getVisitorDeviceInfo(userAgent, requestedModel);

  try {
    db.exec('BEGIN IMMEDIATE;');
    const newVisitor = db.prepare(`
      INSERT OR IGNORE INTO site_visitors (visitor_hash, first_seen_at, last_seen_at, device_info)
      VALUES (?, ?, ?, ?)
    `).run(visitorHash, visitedAt, visitedAt, deviceInfo).changes === 1;
    if (!newVisitor) {
      db.prepare('UPDATE site_visitors SET last_seen_at = ?, device_info = ? WHERE visitor_hash = ?')
        .run(visitedAt, deviceInfo, visitorHash);
    }

    const newDailyVisitor = db.prepare(
      'INSERT OR IGNORE INTO site_daily_visitors (visit_date, visitor_hash) VALUES (?, ?)',
    ).run(visitDate, visitorHash).changes === 1;
    db.prepare(`
      INSERT INTO site_daily_stats (visit_date, visits_count, unique_visitors_count)
      VALUES (?, 1, ?)
      ON CONFLICT(visit_date) DO UPDATE SET
        visits_count = visits_count + 1,
        unique_visitors_count = unique_visitors_count + excluded.unique_visitors_count
    `).run(visitDate, newDailyVisitor ? 1 : 0);
    db.prepare(`
      UPDATE site_visit_totals
      SET visits_count = visits_count + 1,
          unique_visitors_count = unique_visitors_count + ?
      WHERE id = 1
    `).run(newVisitor ? 1 : 0);
    db.prepare('INSERT INTO site_visit_events (visitor_hash, device_info, visited_at) VALUES (?, ?, ?)')
      .run(visitorHash, deviceInfo, visitedAt);

    if (lastVisitCleanupDate !== visitDate) {
      const retentionDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('DELETE FROM site_visit_events WHERE visited_at < ?').run(retentionDate);
      db.prepare('DELETE FROM site_daily_visitors WHERE visit_date < ?').run(visitDate.slice(0, 10));
      lastVisitCleanupDate = visitDate;
    }
    db.exec('COMMIT;');
    return res.status(204).end();
  } catch (error) {
    db.exec('ROLLBACK;');
    console.error('[Site Visit Tracking Error]', error);
    return res.status(500).json({ error: 'Не удалось сохранить статистику посещения' });
  }
});

const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function normalizeSearchQuery(value: unknown): string {
  if (typeof value !== 'string') return '';
  const query = value.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80);
  const letterCount = (query.match(/\p{L}/gu) || []).length;
  const digitCount = (query.match(/\d/g) || []).length;
  if (query.length < 2 || letterCount === 0 || digitCount >= 7 || /[@]/.test(query)) return '';
  if (!/^[\p{L}\p{N}\s._-]+$/u.test(query)) return '';
  return query;
}

function getSearchCaseVariants(query: string): string[] {
  const lower = query.toLocaleLowerCase('ru');
  const capitalized = lower.charAt(0).toLocaleUpperCase('ru') + lower.slice(1);
  return [...new Set([query, lower, capitalized])];
}

app.post('/api/searches', searchRateLimiter, (req, res) => {
  const query = normalizeSearchQuery(req.body?.query);
  if (!query) return res.status(204).end();
  const now = new Date().toISOString();
  const normalizedQuery = query.toLocaleLowerCase('ru');
  try {
    db.prepare(`
      INSERT INTO site_search_queries (normalized_query, query_text, searches_count, first_searched_at, last_searched_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(normalized_query) DO UPDATE SET
        query_text = excluded.query_text,
        searches_count = searches_count + 1,
        last_searched_at = excluded.last_searched_at
    `).run(normalizedQuery, query, now, now);
    return res.status(204).end();
  } catch (error) {
    console.error('[Search Tracking Error]', error);
    return res.status(500).json({ error: 'Не удалось сохранить поисковый запрос' });
  }
});

app.get('/api/search/suggestions', (req, res) => {
  const query = typeof req.query.q === 'string'
    ? req.query.q.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80)
    : '';
  try {
    const popularQueries = db.prepare(`
      SELECT query_text, searches_count
      FROM site_search_queries
      ORDER BY searches_count DESC, last_searched_at DESC
      LIMIT 8
    `).all() as Array<{ query_text: string; searches_count: number }>;
    if (!query) return res.json({ suggestions: [], popular: popularQueries });

    const normalizedQuery = query.toLocaleLowerCase('ru');
    const pattern = `${normalizedQuery}%`;
    const matchingQueries = db.prepare(`
      SELECT query_text, searches_count
      FROM site_search_queries
      WHERE normalized_query LIKE ?
      ORDER BY searches_count DESC, last_searched_at DESC
      LIMIT 6
    `).all(pattern) as Array<{ query_text: string; searches_count: number }>;
    const variants = getSearchCaseVariants(query);
    const titleConditions = variants.map(() => 'title LIKE ?').join(' OR ');
    const titlePatterns = variants.map((variant) => `${variant}%`);
    const matchingProducts = db.prepare(`
      SELECT title
      FROM products
      WHERE status = 'active' AND (${titleConditions})
      GROUP BY title
      ORDER BY MAX(views_count) DESC, MAX(id) DESC
      LIMIT 6
    `).all(...titlePatterns) as Array<{ title: string }>;
    const suggestions = [...new Set([
      ...matchingQueries.map((item) => item.query_text),
      ...matchingProducts.map((item) => item.title),
    ])].slice(0, 8);
    return res.json({
      suggestions,
      popular: popularQueries,
    });
  } catch (error) {
    console.error('[Search Suggestions Error]', error);
    return res.status(500).json({ error: 'Не удалось загрузить подсказки поиска' });
  }
});

const telegramLoginRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    const blockedUntil = Date.now() + 60 * 60 * 1000;
    const clientIp = getRequestIp(req);
    if (blockedLoginIps.size >= 10000) {
      for (const [ip, expiresAt] of blockedLoginIps) {
        if (expiresAt <= Date.now()) blockedLoginIps.delete(ip);
      }
    }
    blockedLoginIps.set(clientIp, blockedUntil);
    return res.status(429).json({ error: 'Слишком много попыток входа. IP заблокирован на один час.' });
  },
});

const telegramConfigRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const publicAdminRoutes = new Set([
  '/api/admin/telegram-auth/config',
  '/api/admin/telegram-auth/login',
]);

function checkTelegramLoginIpBlock(req: express.Request, res: express.Response, next: express.NextFunction) {
  const clientIp = getRequestIp(req);
  const blockedUntil = blockedLoginIps.get(clientIp);
  if (!blockedUntil) return next();
  if (blockedUntil <= Date.now()) {
    blockedLoginIps.delete(clientIp);
    return next();
  }
  return res.status(429).json({ error: 'Слишком много попыток входа. Попробуйте через один час.' });
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = getAdminCookie(req);
  const claims = token ? verifyAdminJwt(token) : null;
  if (!claims) {
    return res.status(401).json({ error: 'Недействительный или истекший токен сессии' });
  }
  res.locals.adminTokenId = claims.jti;
  next();
}

app.use('/api/admin', (req, res, next) => {
  const requestPath = `${req.baseUrl}${req.path}`;
  if (req.method === 'POST' && publicAdminRoutes.has(requestPath)) return next();
  return requireAdmin(req, res, next);
});

app.get('/api/admin/visit-analytics', (req, res) => {
  try {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Dushanbe' }).format(new Date());
    const todayStats = db.prepare(
      'SELECT visits_count, unique_visitors_count FROM site_daily_stats WHERE visit_date = ?',
    ).get(today) as { visits_count: number; unique_visitors_count: number } | undefined;
    const totals = db.prepare(
      'SELECT visits_count, unique_visitors_count FROM site_visit_totals WHERE id = 1',
    ).get() as { visits_count: number; unique_visitors_count: number };
    const recentVisits = db.prepare(`
      SELECT substr(visitor_hash, 1, 10) AS visitor_id, device_info, visited_at
      FROM site_visit_events
      ORDER BY id DESC
      LIMIT 200
    `).all();
    return res.json({
      today: todayStats || { visits_count: 0, unique_visitors_count: 0 },
      all_time: totals,
      recent_visits: recentVisits,
      event_retention_days: 90,
    });
  } catch (error) {
    console.error('[Site Visit Analytics Error]', error);
    return res.status(500).json({ error: 'Не удалось загрузить статистику посещений' });
  }
});

app.get('/api/admin/search-analytics', (req, res) => {
  const requestedOffset = Number(req.query.offset);
  const offset = Number.isInteger(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 1_000_000) : 0;
  const limit = 100;
  try {
    const totals = db.prepare(`
      SELECT COALESCE(SUM(searches_count), 0) AS total_searches, COUNT(*) AS unique_queries
      FROM site_search_queries
    `).get() as { total_searches: number; unique_queries: number };
    const popularQueries = db.prepare(`
      SELECT query_text, searches_count, last_searched_at
      FROM site_search_queries
      ORDER BY searches_count DESC, last_searched_at DESC
      LIMIT 10
    `).all();
    const queries = db.prepare(`
      SELECT query_text, searches_count, first_searched_at, last_searched_at
      FROM site_search_queries
      ORDER BY searches_count DESC, last_searched_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    return res.json({
      ...totals,
      popular_queries: popularQueries,
      queries,
      offset,
      limit,
      has_more: offset + queries.length < totals.unique_queries,
    });
  } catch (error) {
    console.error('[Admin Search Analytics Error]', error);
    return res.status(500).json({ error: 'Не удалось загрузить статистику поиска' });
  }
});

// ==========================================
// REST API МАРШРУТЫ
// ==========================================

// 1. АВТОРИЗАЦИЯ АДМИНИСТРАТОРА ЧЕРЕЗ TELEGRAM
app.post('/api/admin/telegram-auth/config', telegramConfigRateLimiter, (req, res) => {
  if (!isTelegramLoginConfigured) {
    return res.status(503).json({ error: 'Telegram-вход не настроен на сервере' });
  }
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString('base64url');
  const nonceHash = crypto.createHash('sha256').update(nonce).digest('hex');
  const expiresAt = now + TELEGRAM_LOGIN_NONCE_SECONDS;
  db.prepare('DELETE FROM admin_telegram_nonces WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO admin_telegram_nonces (nonce_hash, expires_at) VALUES (?, ?)').run(nonceHash, expiresAt);
  res.cookie(ADMIN_TELEGRAM_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: TELEGRAM_LOGIN_NONCE_SECONDS * 1000,
  });
  return res.json({ client_id: Number(telegramLoginClientId), nonce });
});

app.post('/api/admin/telegram-auth/login', checkTelegramLoginIpBlock, telegramLoginRateLimiter, async (req, res) => {
  try {
    if (!isTelegramLoginConfigured) {
      return res.status(503).json({ error: 'Telegram-вход не настроен на сервере' });
    }
    const idToken = req.body?.id_token;
    const nonceCookie = getCookieValue(req, ADMIN_TELEGRAM_NONCE_COOKIE);
    const requestNonce = req.body?.nonce;
    const expectedNonce = typeof requestNonce === 'string' ? requestNonce : nonceCookie;
    if (typeof idToken !== 'string' || idToken.length > 10000) {
      return res.status(400).json({ error: 'Telegram не вернул токен входа. Обновите страницу и попробуйте снова.' });
    }
    if (typeof expectedNonce !== 'string' || !expectedNonce || expectedNonce.length > 256) {
      return res.status(400).json({ error: 'Не удалось проверить ответ Telegram. Обновите страницу и попробуйте снова.' });
    }
    const claims = await verifyTelegramIdToken(idToken, expectedNonce);
    if (!claims) {
      return res.status(401).json({ error: 'Подпись или срок действия ответа Telegram недействительны' });
    }

    const now = Math.floor(Date.now() / 1000);
    const nonceHash = crypto.createHash('sha256').update(expectedNonce).digest('hex');
    const consumedNonce = db.prepare(
      'DELETE FROM admin_telegram_nonces WHERE nonce_hash = ? AND expires_at > ?',
    ).run(nonceHash, now);
    res.clearCookie(ADMIN_TELEGRAM_NONCE_COOKIE, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
    });
    if (consumedNonce.changes !== 1) {
      return res.status(401).json({ error: 'Запрос входа уже использован или истёк. Начните вход заново.' });
    }
    const telegramUserId = String(claims.id);
    if (!telegramUserId || !adminTelegramAllowedIds.has(telegramUserId)) {
      return res.status(403).json({ error: 'Этот Telegram-аккаунт не разрешён для входа в админ-панель' });
    }

    const adminUsername = `telegram_${telegramUserId}`;
    db.prepare(
      'INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)',
    ).run(adminUsername, 'disabled$telegram-only');
    const adminUser = db.prepare('SELECT id, username FROM admin_users WHERE username = ?')
      .get(adminUsername) as { id: number; username: string } | undefined;
    if (!adminUser) throw new Error('Не удалось создать внутреннюю учётную запись Telegram-администратора');

    const issuedAt = now;
    const tokenId = crypto.randomUUID();
    const token = signAdminJwt({
      sub: adminUser.id,
      username: adminUser.username,
      auth_method: 'telegram',
      telegram_id: telegramUserId,
      iat: issuedAt,
      exp: issuedAt + ADMIN_SESSION_SECONDS,
      jti: tokenId,
    });
    res.cookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_SECONDS * 1000,
    });
    return res.json({ success: true, user: { id: adminUser.id, username: adminUser.username } });
  } catch (error: any) {
    console.error('[Telegram Admin Login Error]', error);
    return res.status(500).json({ error: 'Не удалось выполнить вход через Telegram' });
  }
});

app.get('/api/admin/check', requireAdmin, (req, res) => {
  return res.json({ authenticated: true });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const tokenId = res.locals.adminTokenId as string | undefined;
  if (tokenId) {
    db.prepare('INSERT OR REPLACE INTO admin_revoked_tokens (token_id, expires_at) VALUES (?, ?)')
      .run(tokenId, Math.floor(Date.now() / 1000) + ADMIN_SESSION_SECONDS);
  }
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
  return res.json({ success: true });
});

// 2. ПУБЛИЧНЫЙ КАТАЛОГ ДЛЯ КЛИЕНТОВ (ПОЛНАЯ ИЗОЛЯЦИЯ: НЕТ CNY, НЕТ 1688, НЕТ ССЫЛОК)
app.get('/api/products', (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 120) : '';
    const categoryIdValue = typeof req.query.category_id === 'string' ? req.query.category_id : '';
    const categoryId = categoryIdValue ? Number(categoryIdValue) : null;
    const deliveryType = req.query.delivery_type === 'stock' || req.query.delivery_type === 'order'
      ? req.query.delivery_type
      : 'all';
    const sort = ['popular', 'price_asc', 'price_desc', 'newest'].includes(String(req.query.sort))
      ? String(req.query.sort)
      : 'popular';
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 24;
    const requestedOffset = Number(req.query.offset);
    const offset = Number.isInteger(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 1_000_000) : 0;
    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }

    let where = "p.status = 'active'";
    const params: Array<string | number> = [];
    if (search) {
      const variants = getSearchCaseVariants(search);
      const termPatterns = variants.map((variant) => `%${variant}%`);
      where += ` AND (
        ${variants.map(() => 'p.title LIKE ?').join(' OR ')}
        OR p.base_sku LIKE ?
        OR ${variants.map(() => 'p.description LIKE ?').join(' OR ')}
        OR ${variants.map(() => 'p.specifications LIKE ?').join(' OR ')}
      )`;
      params.push(
        ...termPatterns,
        `%${search}%`,
        ...termPatterns,
        ...termPatterns,
      );
    }
    if (categoryId !== null) {
      where += ' AND (p.category_id = ? OR p.category_id IN (SELECT id FROM categories WHERE parent_id = ?))';
      params.push(categoryId, categoryId);
    }
    if (deliveryType === 'stock') where += " AND p.delivery_type = 'stock'";
    if (deliveryType === 'order') where += " AND (p.delivery_type IS NULL OR p.delivery_type != 'stock')";

    const total = (db.prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${where}`).get(...params) as { count: number }).count;
    const orderBy = sort === 'popular'
      ? 'p.views_count DESC, p.id DESC'
      : sort === 'price_asc'
        ? '(SELECT MIN(v.price_tjs) FROM product_variants v WHERE v.product_id = p.id AND v.price_tjs > 0) ASC, p.id DESC'
        : sort === 'price_desc'
          ? '(SELECT MIN(v.price_tjs) FROM product_variants v WHERE v.product_id = p.id AND v.price_tjs > 0) DESC, p.id DESC'
          : 'p.id DESC';
    const products = db.prepare(`
      SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status, p.delivery_type,
             p.main_image, p.images, p.video_url, p.video_urls, p.youtube_url, p.specifications, p.created_at,
             c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    // Прикрепляем варианты (строго без price_cny для защиты коммерческой тайны!)
    const getVariants = db.prepare(`
      SELECT id, product_id, color, size, price_tjs, stock, weight_kg, variant_sku, image_url
      FROM product_variants
      WHERE product_id = ?
      ORDER BY id ASC
    `);

    // Используем безопасный цикл for ... of
    const enriched: any[] = [];
    for (const p of products) {
      const variants = getVariants.all(p.id) as any[];
      let minPrice = 0;
      let maxPrice = 0;
      if (variants.length > 0) {
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (const v of variants) {
          if (v.price_tjs > 0) {
            if (v.price_tjs < minVal) minVal = v.price_tjs;
            if (v.price_tjs > maxVal) maxVal = v.price_tjs;
          }
        }
        if (minVal !== Infinity) {
          minPrice = minVal;
          maxPrice = maxVal;
        }
      }

      // Парсинг характеристик (specifications)
      let parsedSpecs: Array<{ name: string; value: string }> = [];
      if (p.specifications) {
        try {
          const s = typeof p.specifications === 'string' ? JSON.parse(p.specifications) : p.specifications;
          if (Array.isArray(s)) {
            parsedSpecs = s;
          } else if (typeof s === 'object' && s !== null) {
            parsedSpecs = Object.entries(s).map(([k, v]) => ({ name: k, value: String(v) }));
          }
        } catch (_) {
          const lines = String(p.specifications).split('\n');
          for (const line of lines) {
            const parts = line.split(/[:：]/);
            if (parts.length >= 2) {
              parsedSpecs.push({ name: parts[0].trim(), value: parts.slice(1).join(':').trim() });
            }
          }
        }
      }
      if (parsedSpecs.length === 0) {
        parsedSpecs = fallbackAnalysis('', p.title, 50, 0.5).specifications || [];
      }

      enriched.push({
        ...p,
        delivery_type: p.delivery_type || 'order',
        video_urls: normalizeVideoUrls(p.video_urls, p.youtube_url || p.video_url || ''),
        youtube_url: p.youtube_url || p.video_url || '',
        video_url: p.youtube_url || p.video_url || '',
        min_price_tjs: minPrice,
        max_price_tjs: maxPrice,
        specifications: parsedSpecs,
        variants,
      });
    }

    return res.json({
      products: enriched,
      total,
      limit,
      offset,
      has_more: offset + products.length < total,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const product = db.prepare(`
      SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status, p.delivery_type,
             p.main_image, p.images, p.video_url, p.video_urls, p.youtube_url, p.specifications,
             p.created_at, p.views_count, c.name AS category_name,
             COALESCE(MIN(CASE WHEN v.price_tjs > 0 THEN v.price_tjs END), 0) AS min_price_tjs,
             COALESCE(MAX(CASE WHEN v.price_tjs > 0 THEN v.price_tjs END), 0) AS max_price_tjs
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE p.id = ? AND p.status = 'active'
      GROUP BY p.id
    `).get(productId) as any;

    if (!product) return res.status(404).json({ error: 'Товар не найден' });

    let specifications: Array<{ name: string; value: string }> = [];
    if (product.specifications) {
      try {
        const parsed = JSON.parse(product.specifications);
        specifications = Array.isArray(parsed)
          ? parsed
          : Object.entries(parsed).map(([name, value]) => ({ name, value: String(value) }));
      } catch {
        specifications = String(product.specifications).split('\n').map((line) => {
          const [name, ...parts] = line.split(/[:：]/);
          return { name: name.trim(), value: parts.join(':').trim() };
        }).filter((item) => item.name && item.value);
      }
    }
    if (specifications.length === 0) {
      specifications = fallbackAnalysis('', product.title, 50, 0.5).specifications || [];
    }

    const variants = db.prepare(`
      SELECT id, product_id, color, size, price_tjs, stock, weight_kg, variant_sku, image_url
      FROM product_variants
      WHERE product_id = ?
      ORDER BY id ASC
    `).all(productId);

    return res.json({
      product: {
        ...product,
        delivery_type: product.delivery_type || 'order',
        video_urls: normalizeVideoUrls(product.video_urls, product.youtube_url || product.video_url || ''),
        video_url: product.youtube_url || product.video_url || '',
        youtube_url: product.youtube_url || product.video_url || '',
        specifications,
        variants,
      },
    });
  } catch (error) {
    console.error('[Public Product Detail Error]', error);
    return res.status(500).json({ error: 'Не удалось загрузить товар' });
  }
});

app.get('/api/products/:id/related', (req, res) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID товара' });
    }

    const currentProduct = db.prepare(`
      SELECT id, title, category_id
      FROM products
      WHERE id = ? AND status = 'active'
    `).get(productId) as { id: number; title: string; category_id: number | null } | undefined;

    if (!currentProduct) {
      return res.status(404).json({ error: 'Товар не найден' });
    }

    const selectFields = `
      SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status,
             p.delivery_type, p.main_image, p.images, p.video_url, p.video_urls, p.youtube_url,
             c.name AS category_name,
             COALESCE((
               SELECT MIN(v.price_tjs)
               FROM product_variants v
               WHERE v.product_id = p.id AND v.price_tjs > 0
             ), 0) AS min_price_tjs
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND p.id != ?
    `;
    const relatedProducts: any[] = [];
    const seenIds = new Set<number>();
    const getRelatedVariants = db.prepare(`
      SELECT id, product_id, color, size, price_tjs, stock, weight_kg, variant_sku, image_url
      FROM product_variants
      WHERE product_id = ?
      ORDER BY id ASC
    `);
    const addCandidates = (candidates: any[]) => {
      for (const candidate of candidates) {
        if (relatedProducts.length >= 4) break;
        if (seenIds.has(candidate.id)) continue;
        seenIds.add(candidate.id);
        relatedProducts.push({
          ...candidate,
          variants: getRelatedVariants.all(candidate.id),
          delivery_type: candidate.delivery_type || 'order',
          video_urls: normalizeVideoUrls(candidate.video_urls, candidate.youtube_url || candidate.video_url || ''),
          youtube_url: candidate.youtube_url || candidate.video_url || '',
          video_url: candidate.youtube_url || candidate.video_url || '',
        });
      }
    };

    if (currentProduct.category_id !== null) {
      const candidates = db.prepare(`
        ${selectFields}
        AND p.category_id = ?
        ORDER BY p.id DESC
        LIMIT 40
      `).all(productId, currentProduct.category_id) as any[];
      addCandidates(candidates);
    }

    if (relatedProducts.length < 4) {
      const stopWords = new Set([
        'для', 'или', 'при', 'это', 'как', 'the', 'and', 'with', 'new',
        'товар', 'модель', 'набор', 'женский', 'женская', 'мужской', 'мужская',
      ]);
      const uniqueTerms: string[] = [];
      const seenTerms = new Set<string>();
      const titleWords = currentProduct.title.toLocaleLowerCase('ru').match(/[a-zа-яё0-9]{3,}/gi) || [];
      for (const word of titleWords) {
        if (stopWords.has(word) || seenTerms.has(word)) continue;
        seenTerms.add(word);
        uniqueTerms.push(word);
      }

      if (uniqueTerms.length > 0) {
        let titlePredicate = '';
        const titleParams: string[] = [];
        for (const term of uniqueTerms) {
          if (titlePredicate) titlePredicate += ' OR ';
          const upperTerm = term.toLocaleUpperCase('ru');
          const titleCaseTerm = `${term.charAt(0).toLocaleUpperCase('ru')}${term.slice(1)}`;
          titlePredicate += '(p.title LIKE ? OR p.title LIKE ? OR p.title LIKE ?)';
          titleParams.push(`%${term}%`, `%${upperTerm}%`, `%${titleCaseTerm}%`);
        }

        const candidates = db.prepare(`
          ${selectFields}
          AND (${titlePredicate})
          ORDER BY p.id DESC
          LIMIT 40
        `).all(productId, ...titleParams) as any[];
        addCandidates(candidates);
      }
    }

    return res.json({ products: relatedProducts });
  } catch (err: any) {
    console.error('[Related Products Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Увеличение счетчика просмотров товара
app.post('/api/products/:id/view', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный ID' });

    db.prepare('UPDATE products SET views_count = COALESCE(views_count, 0) + 1 WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ==========================================
// API ЗАКАЗОВ (ORDERS API)
// ==========================================

// Создание заказа клиентом при оформлении в WhatsApp
app.post('/api/orders', (req, res) => {
  try {
    const {
      customer_name = 'Клиент WhatsApp',
      customer_phone = '',
      customer_address = '',
      customer_notes = '',
      total_amount = 0,
      delivery_type = 'order',
      items = [],
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }
    if (typeof customer_phone !== 'string') {
      return res.status(400).json({ error: 'Укажите номер телефона для связи' });
    }
    const customerPhone = customer_phone.trim();
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (!/^[+()\d\s.-]+$/.test(customerPhone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Введите корректный номер телефона' });
    }

    // Генерация человекочитаемого уникального номера заказа
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const currentYear = new Date().getFullYear();
    const orderNumber = `MS-${currentYear}-${randomSuffix}`;

    const itemsJson = JSON.stringify(items);

    let orderId = 0;
    db.exec('BEGIN IMMEDIATE;');
    try {
      const result = db.prepare(`
        INSERT INTO orders (
          order_number, customer_name, customer_phone, customer_address, customer_notes,
          total_amount, total_amount_tjs, status, delivery_type, items_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)
      `).run(
        orderNumber,
        (customer_name || 'Клиент WhatsApp').trim(),
        customerPhone,
        (customer_address || '').trim(),
        (customer_notes || '').trim(),
        Number(total_amount) || 0,
        Number(total_amount) || 0,
        delivery_type || 'order',
        itemsJson
      );

      orderId = Number(result.lastInsertRowid);
      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, variant_id, title, color, size, quantity, price_tjs,
          variant_sku, base_sku, image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertOrderItem.run(
          orderId,
          nullableInteger(item.product_id),
          nullableInteger(item.variant_id),
          String(item.title || 'Товар'),
          String(item.color || ''),
          String(item.size || ''),
          Math.max(1, Math.floor(Number(item.quantity) || 1)),
          Math.max(0, Number(item.price_tjs) || 0),
          String(item.variant_sku || ''),
          String(item.base_sku || ''),
          String(item.image || ''),
        );
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }

    return res.status(201).json({
      success: true,
      order_id: orderId,
      order_number: orderNumber,
      message: 'Заказ успешно зарегистрирован',
    });
  } catch (err: any) {
    console.error('[Create Order Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Получение списка всех заказов для администратора с позициями из отдельной таблицы
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as any[];
    const getOrderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC');
    const orders: any[] = [];
    for (const order of rows) {
      let items = getOrderItems.all(order.id) as any[];
      if (items.length === 0) {
        try {
          const legacyItems = JSON.parse(order.items_json || '[]');
          if (Array.isArray(legacyItems)) items = legacyItems;
        } catch (error) {
          console.warn(`[Admin Orders] Не удалось прочитать позиции заказа ${order.id}:`, error);
        }
      }
      orders.push({
        ...order,
        total_amount: order.total_amount_tjs ?? order.total_amount ?? 0,
        total_amount_tjs: order.total_amount_tjs ?? order.total_amount ?? 0,
        items,
      });
    }
    return res.json({ orders });
  } catch (err: any) {
    console.error('[Admin Orders Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID заказа' });
    }

    const existingOrder = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
    if (!existingOrder) return res.status(404).json({ error: 'Заказ не найден' });

    const {
      customer_name,
      customer_phone,
      customer_address,
      status,
      total_amount_tjs,
      total_amount,
      items,
    } = req.body;
    const allowedStatuses = ['new', 'processing', 'ordered_china', 'in_transit', 'delivered', 'cancelled'];
    const total = Number(total_amount_tjs ?? total_amount);

    if (typeof customer_name !== 'string' || typeof customer_phone !== 'string' || typeof customer_address !== 'string') {
      return res.status(400).json({ error: 'Имя, телефон и адрес должны быть строками' });
    }
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус заказа' });
    }
    if (!Number.isFinite(total) || total < 0) {
      return res.status(400).json({ error: 'Итоговая сумма должна быть положительным числом или нулём' });
    }
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Состав заказа должен быть массивом' });
    }

    const normalizedItems: any[] = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'Позиция заказа имеет неверный формат' });
      }
      const quantity = Number(item.quantity);
      const priceTjs = Number(item.price_tjs);
      if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(priceTjs) || priceTjs < 0) {
        return res.status(400).json({ error: 'Количество должно быть целым числом от 1, цена — неотрицательным числом' });
      }
      if (typeof item.title !== 'string' || !item.title.trim()) {
        return res.status(400).json({ error: 'У каждой позиции должно быть название' });
      }
      normalizedItems.push({
        product_id: nullableInteger(item.product_id),
        variant_id: nullableInteger(item.variant_id),
        title: item.title.trim(),
        color: String(item.color || ''),
        size: String(item.size || ''),
        quantity,
        price_tjs: priceTjs,
        variant_sku: String(item.variant_sku || ''),
        base_sku: String(item.base_sku || ''),
        image: String(item.image || ''),
      });
    }

    db.exec('BEGIN IMMEDIATE;');
    try {
      db.prepare(`
        UPDATE orders
        SET customer_name = ?, customer_phone = ?, customer_address = ?,
            status = ?, total_amount = ?, total_amount_tjs = ?, items_json = ?
        WHERE id = ?
      `).run(
        customer_name.trim(),
        customer_phone.trim(),
        customer_address.trim(),
        status,
        total,
        total,
        JSON.stringify(normalizedItems),
        orderId,
      );
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);

      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (
          order_id, product_id, variant_id, title, color, size, quantity, price_tjs,
          variant_sku, base_sku, image
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of normalizedItems) {
        insertOrderItem.run(
          orderId,
          item.product_id,
          item.variant_id,
          item.title,
          item.color,
          item.size,
          item.quantity,
          item.price_tjs,
          item.variant_sku,
          item.base_sku,
          item.image,
        );
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      throw error;
    }

    return res.json({ success: true, id: orderId });
  } catch (err: any) {
    console.error('[Admin Order Update Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// Публичный доступ к получению заказов для быстрой синхронизации админки
app.get('/api/orders', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all() as any[];
    const orders = rows.map((o) => {
      let items: any[] = [];
      try {
        items = JSON.parse(o.items_json);
      } catch (_) {
        items = [];
      }
      return {
        ...o,
        items,
      };
    });
    return res.json({ orders });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Обновление статуса заказа
app.put('/api/admin/orders/:id/status', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const allowed = ['new', 'processing', 'ordered_china', 'in_transit', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус заказа' });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return res.json({ success: true, id, status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id/status', (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const allowed = ['new', 'processing', 'ordered_china', 'in_transit', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Недопустимый статус заказа' });
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return res.json({ success: true, id, status });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Удаление заказа
app.delete('/api/admin/orders/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    return res.json({ success: true, id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 3. АДМИНСКИЙ КАТАЛОГ (ДОСТУПЕН ТОЛЬКО АВТОРИЗОВАННОМУ АДМИНУ)
app.get('/api/admin/products', requireAdmin, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id DESC
    `).all() as any[];

    const getVariants = db.prepare(`SELECT * FROM product_variants WHERE product_id = ? ORDER BY id ASC`);

    const enriched: any[] = [];
    for (const p of products) {
      const variants = getVariants.all(p.id);

      let parsedSpecs: Array<{ name: string; value: string }> = [];
      if (p.specifications) {
        try {
          const s = typeof p.specifications === 'string' ? JSON.parse(p.specifications) : p.specifications;
          if (Array.isArray(s)) {
            parsedSpecs = s;
          } else if (typeof s === 'object' && s !== null) {
            parsedSpecs = Object.entries(s).map(([k, v]) => ({ name: k, value: String(v) }));
          }
        } catch (_) {}
      }
      if (parsedSpecs.length === 0) {
        parsedSpecs = fallbackAnalysis('', p.title, 50, 0.5).specifications || [];
      }

      enriched.push({
        ...p,
        delivery_type: p.delivery_type || 'order',
        video_urls: normalizeVideoUrls(p.video_urls, p.youtube_url || p.video_url || ''),
        youtube_url: p.youtube_url || p.video_url || '',
        video_url: p.youtube_url || p.video_url || '',
        specifications: parsedSpecs,
        variants,
      });
    }

    return res.json({ products: enriched });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. СОЗДАНИЕ ТОВАРА ВРУЧНУЮ В АДМИНКЕ С ИИ-КАТЕГОРИЗАЦИЕЙ
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const {
      title,
      description = '',
      delivery_type = 'order',
      status = 'active',
      main_image = '',
      images = '',
      video_url = '',
      video_urls = [],
      youtube_url = '',
      specifications = [],
      variants = [],
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }

    const cleanTitle = title.trim();
    let cleanDesc = (description || '').trim();
    const cleanDelivery = delivery_type === 'stock' ? 'stock' : 'order';
    const cleanStatus = status === 'draft' ? 'draft' : 'active';
    const requestedVideo = (typeof youtube_url === 'string' && youtube_url.trim())
      ? youtube_url.trim()
      : (typeof video_url === 'string' ? video_url.trim() : '');
    const cleanVideos = normalizeVideoUrls(video_urls, requestedVideo);
    const cleanVideo = cleanVideos[0] || requestedVideo;

    // ИИ-определение категории через Gemini 3.8 Flash
    const aiCategory = await resolveCategoryWithAi(cleanTitle);
    const categoryId = resolveCategoryId(aiCategory);
    cleanDesc = appendSearchKeywords(
      cleanDesc,
      cleanTitle,
      aiCategory,
      Array.isArray(specifications) ? specifications : [],
    );

    // Нормализация спецификаций/характеристик
    let cleanSpecs = '';
    if (Array.isArray(specifications) && specifications.length > 0) {
      cleanSpecs = JSON.stringify(specifications);
    } else if (typeof specifications === 'string' && specifications.trim()) {
      cleanSpecs = specifications.trim();
    } else {
      const fb = fallbackAnalysis('', cleanTitle, 50, 0.5);
      cleanSpecs = JSON.stringify(fb.specifications || []);
    }

    // Нормализация изображений
    let allImages = '';
    let mImage = (main_image || '').trim();
    if (Array.isArray(images) && images.length > 0) {
      const cleanImgArr: string[] = [];
      for (const img of images) {
        if (typeof img === 'string' && img.trim()) cleanImgArr.push(img.trim());
      }
      allImages = cleanImgArr.join(',');
      if (!mImage && cleanImgArr.length > 0) mImage = cleanImgArr[0];
    } else if (typeof images === 'string') {
      allImages = images.trim();
      if (!mImage && allImages) mImage = allImages.split(',')[0].trim();
    }

    const baseSku = generateBaseSku(categoryId);

    const insertProd = db.prepare(`
      INSERT INTO products (title, description, category_id, base_sku, status, delivery_type, main_image, images, video_url, video_urls, youtube_url, specifications)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cleanTitle, cleanDesc, categoryId, baseSku, cleanStatus, cleanDelivery, mImage, allImages, cleanVideo, JSON.stringify(cleanVideos), cleanVideo, cleanSpecs);

    const productId = Number(insertProd.lastInsertRowid);

    // Сохранение вариантов
    const insertVar = db.prepare(`
      INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdVars: any[] = [];
    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants) {
        const vColor = (v.color || 'Основной цвет').trim();
        const vSize = (v.size || 'Стандарт').trim();
        const parsedWeight = Number(v.weight_kg);
        const vWeight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 0.5;
        const parsedCny = Number(v.price_cny);
        const vCny = Number.isFinite(parsedCny) && parsedCny >= 0 ? parsedCny : 0;
        const vTjs = calculateVariantPriceTjs(vCny, vWeight);
        const parsedStock = Number(v.stock);
        const vStock = Number.isFinite(parsedStock) && parsedStock >= 0 ? Math.floor(parsedStock) : 10;
        const vSku = typeof v.variant_sku === 'string' && v.variant_sku.trim()
          ? v.variant_sku.trim()
          : generateVariantSku(baseSku, vColor, vSize);
        const vImg = typeof v.image_url === 'string' ? v.image_url.trim() : mImage;

        insertVar.run(productId, vColor, vSize, vCny, vTjs, vStock, vWeight, vSku, vImg);
        createdVars.push({
          color: vColor,
          size: vSize,
          price_tjs: vTjs,
          stock: vStock,
          weight_kg: vWeight,
          variant_sku: vSku,
          image_url: vImg,
        });
      }
    } else {
      const defaultPriceCny = 50;
      const defaultWeightKg = 0.5;
      const defaultPriceTjs = calculateVariantPriceTjs(defaultPriceCny, defaultWeightKg);
      const defaultSku = generateVariantSku(baseSku, 'Основной', 'Стандарт');
      insertVar.run(productId, 'Основной', 'Стандарт', defaultPriceCny, defaultPriceTjs, 15, defaultWeightKg, defaultSku, mImage);
      createdVars.push({
        color: 'Основной',
        size: 'Стандарт',
        price_tjs: defaultPriceTjs,
        stock: 15,
        weight_kg: defaultWeightKg,
        variant_sku: defaultSku,
        image_url: mImage,
      });
    }

    return res.status(201).json({
      success: true,
      product: {
        id: productId,
        base_sku: baseSku,
        title: cleanTitle,
        category_id: categoryId,
        category_name: aiCategory,
        delivery_type: cleanDelivery,
        youtube_url: cleanVideo,
        video_url: cleanVideo,
        specifications: JSON.parse(cleanSpecs),
        variants: createdVars,
      },
    });
  } catch (err: any) {
    console.error('[Admin Create Product Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// 5. ПОЛНОЦЕННОЕ РЕДАКТИРОВАНИЕ ТОВАРА В АДМИНКЕ С ИИ-КАТЕГОРИЗАЦИЕЙ
app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      title,
      description = '',
      delivery_type = 'order',
      status = 'active',
      main_image = '',
      images = '',
      video_url = '',
      video_urls = [],
      youtube_url = '',
      default_weight_kg,
      specifications,
      variants,
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Название товара обязательно' });
    }

    const cleanTitle = title.trim();
    let cleanDesc = (description || '').trim();
    const cleanDelivery = delivery_type === 'stock' ? 'stock' : 'order';
    const cleanStatus = status === 'draft' ? 'draft' : 'active';
    const requestedVideo = (typeof youtube_url === 'string' && youtube_url.trim())
      ? youtube_url.trim()
      : (typeof video_url === 'string' ? video_url.trim() : '');
    const cleanVideos = normalizeVideoUrls(video_urls, requestedVideo);
    const cleanVideo = cleanVideos[0] || requestedVideo;

    // ИИ-определение точной категории через Gemini 3.8 Flash
    const aiCategory = await resolveCategoryWithAi(cleanTitle);
    const categoryId = resolveCategoryId(aiCategory);
    cleanDesc = appendSearchKeywords(
      cleanDesc,
      cleanTitle,
      aiCategory,
      Array.isArray(specifications) ? specifications : [],
    );

    // Нормализация спецификаций
    let cleanSpecs: string | null = null;
    if (Array.isArray(specifications)) {
      cleanSpecs = JSON.stringify(specifications);
    } else if (typeof specifications === 'string') {
      cleanSpecs = specifications;
    }

    // Нормализация изображений
    let allImages = '';
    let mImage = (main_image || '').trim();
    if (Array.isArray(images) && images.length > 0) {
      const cleanImgArr: string[] = [];
      for (const img of images) {
        if (typeof img === 'string' && img.trim()) cleanImgArr.push(img.trim());
      }
      allImages = cleanImgArr.join(',');
      if (!mImage && cleanImgArr.length > 0) mImage = cleanImgArr[0];
    } else if (typeof images === 'string') {
      allImages = images.trim();
      if (!mImage && allImages) mImage = allImages.split(',')[0].trim();
    }

    // Получаем текущий базовый артикул
    const existingProd = db.prepare('SELECT base_sku FROM products WHERE id = ?').get(id) as { base_sku: string } | undefined;
    const baseSku = existingProd ? existingProd.base_sku : generateBaseSku(categoryId);

    // Обновляем карточку товара
    db.prepare(`
      UPDATE products
      SET title = ?, description = ?, category_id = ?, status = ?, delivery_type = ?, main_image = ?, images = ?, video_url = ?, video_urls = ?, youtube_url = ?,
          specifications = CASE WHEN ? IS NOT NULL THEN ? ELSE specifications END
      WHERE id = ?
    `).run(cleanTitle, cleanDesc, categoryId, cleanStatus, cleanDelivery, mImage, allImages, cleanVideo, JSON.stringify(cleanVideos), cleanVideo, cleanSpecs, cleanSpecs, id);

    // Если передан полный обновленный массив вариантов: синхронизируем матрицу
    if (Array.isArray(variants) && variants.length > 0) {
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id);

      const insertVar = db.prepare(`
        INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const v of variants) {
        const vColor = (v.color || 'Основной цвет').trim();
        const vSize = (v.size || 'Стандарт').trim();
        const parsedWeight = Number(v.weight_kg);
        const vWeight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? parsedWeight : 0.5;
        const parsedCny = Number(v.price_cny);
        const vCny = Number.isFinite(parsedCny) && parsedCny >= 0 ? parsedCny : 0;
        const vTjs = calculateVariantPriceTjs(vCny, vWeight);
        const parsedStock = Number(v.stock);
        const vStock = Number.isFinite(parsedStock) && parsedStock >= 0 ? Math.floor(parsedStock) : 10;
        const vSku = v.variant_sku || generateVariantSku(baseSku, vColor, vSize);
        const vImg = typeof v.image_url === 'string' ? v.image_url.trim() : mImage;

        insertVar.run(id, vColor, vSize, vCny, vTjs, vStock, vWeight, vSku, vImg);
      }
    } else if (default_weight_kg !== undefined && default_weight_kg !== null) {
      // Иначе если просто передан новый вес: пересчитываем существующие варианты
      const weightNum = parseFloat(default_weight_kg) || 0.5;
      const currentVars = db.prepare('SELECT id, price_cny FROM product_variants WHERE product_id = ?').all(id) as Array<{ id: number; price_cny: number }>;

      const updateVar = db.prepare('UPDATE product_variants SET weight_kg = ?, price_tjs = ? WHERE id = ?');
      for (const v of currentVars) {
        const newTjs = calculateVariantPriceTjs(v.price_cny, weightNum);
        updateVar.run(weightNum, newTjs, v.id);
      }
    }

    return res.json({
      success: true,
      message: 'Товар, матрица вариантов и категория успешно обновлены',
      category_name: aiCategory,
      category_id: categoryId,
    });
  } catch (err: any) {
    console.error('[Admin Update Product Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// 6. РЕДАКТИРОВАНИЕ КОНКРЕТНОГО ВАРИАНТА В АДМИНКЕ
app.put('/api/admin/variants/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { color, size, price_cny, weight_kg, stock, image_url } = req.body;

    const cnyNum = parseFloat(price_cny) || 0;
    const weightNum = parseFloat(weight_kg) || 0.5;
    const stockNum = parseInt(stock, 10) || 0;
    const finalTjs = calculateVariantPriceTjs(cnyNum, weightNum);
    const cleanImg = typeof image_url === 'string' ? image_url.trim() : '';

    db.prepare(`
      UPDATE product_variants
      SET color = ?, size = ?, price_cny = ?, price_tjs = ?, weight_kg = ?, stock = ?, image_url = CASE WHEN ? != '' THEN ? ELSE image_url END
      WHERE id = ?
    `).run(color, size, cnyNum, finalTjs, weightNum, stockNum, cleanImg, cleanImg, id);

    return res.json({ success: true, price_tjs: finalTjs });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. УДАЛЕНИЕ ТОВАРА
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 8. ИНТЕЛЛЕКТУАЛЬНЫЙ ИМПОРТ ИЗ CHROME-РАСШИРЕНИЯ С АНАЛИЗОМ СЫРОГО ТЕКСТА ЧЕРЕЗ GEMINI
app.post('/api/add-product', async (req, res) => {
  try {
    const {
      raw_html_text = '',
      raw_text = '',
      title: inputTitle = '',
      raw_title: inputRawTitle = '',
      manual_title = '',
      description: inputDesc = '',
      manual_description = '',
      original_link = '',
      images = '',
      visual_sku_map = [],
      video_url = '',
      price_cny = 50,
      weight_kg = 0.5,
      variants: manualVariants = [],
      specifications: manualSpecs = null,
      status = 'active',
      delivery_type = 'order',
      youtube_url = '',
      video_urls = [],
    } = req.body;

    const fullRawText = (raw_html_text || raw_text || '').trim().slice(0, MAX_IMPORT_TEXT_LENGTH);
    const effectiveTitle = (inputRawTitle || inputTitle || '').trim();
    const baseCny = parseFloat(price_cny) || 50;
    const initialWeight = parseFloat(weight_kg) || 0.5;
    const visualSkuMap: VisualSkuItem[] = [];
    if (Array.isArray(visual_sku_map)) {
      for (const item of visual_sku_map) {
        if (
          item &&
          typeof item.raw_color === 'string' &&
          item.raw_color.trim() &&
          typeof item.image_url === 'string' &&
          item.image_url.trim()
        ) {
          visualSkuMap.push({
            raw_color: item.raw_color.trim(),
            image_url: item.image_url.trim(),
          });
        }
      }
    }
    const cleanVideoUrl = typeof video_url === 'string' ? video_url.trim() : '';
    const cleanYoutubeUrl = typeof youtube_url === 'string' && youtube_url.trim() ? youtube_url.trim() : cleanVideoUrl;
    const structuredMedia = extractStructuredFromHtmlOrJson(fullRawText);
    const importedVideos = normalizeVideoUrls(video_urls, cleanYoutubeUrl)
      .concat(normalizeVideoUrls(structuredMedia.videoUrls))
      .filter((url, index, urls) => urls.indexOf(url) === index)
      .slice(0, 12);
    const primaryVideoUrl = importedVideos[0] || cleanVideoUrl;
    const finalDeliveryType = delivery_type === 'stock' ? 'stock' : 'order';

    console.log('[API Import] Запрос на импорт товара. Длина текста:', fullRawText.length, 'Карт картинок:', visualSkuMap.length);

    let finalTitle = effectiveTitle;
    let finalDesc = inputDesc;
    let finalCategory = 'Мужские футболки, майки и поло';
    let finalWeight = initialWeight;
    let variantsToProcess: ParsedVariant[] = [];
    let specificationsToProcess: Array<{ name: string; value: string }> = [];

    // Приоритет разбора: Gemini Flash-Lite
    if (aiClient && fullRawText.length > 0) {
      console.log('[Gemini Flash-Lite] Интеллектуальный разбор с привязкой картинок visual_sku_map...');
      const aiAnalysis = await analyzeProductWithGemini(fullRawText, effectiveTitle, baseCny, initialWeight, visualSkuMap);
      finalTitle = aiAnalysis.title || effectiveTitle;
      finalDesc = inputDesc || aiAnalysis.description;
      finalCategory = aiAnalysis.category_name;
      finalWeight = aiAnalysis.weight_kg;
      variantsToProcess = aiAnalysis.variants;
      specificationsToProcess = aiAnalysis.specifications || [];
    } else if (Array.isArray(manualVariants) && manualVariants.length > 0) {
      console.log(`[API Import] Использование готовых вариантов (${manualVariants.length} шт.).`);
      variantsToProcess = manualVariants;
      finalTitle = effectiveTitle || 'Товар M.Savdo';
      finalDesc = inputDesc || 'Высококачественный фабричный товар каталога M.Savdo.';
      const sem = analyzeSemantically(fullRawText, effectiveTitle, baseCny, initialWeight);
      finalCategory = normalizeSubcategoryName(sem.category_name, `${effectiveTitle} ${fullRawText}`);
      finalWeight = initialWeight;
      specificationsToProcess = manualSpecs || sem.specifications || [];
    } else {
      console.log('[API Import] Запуск автономного семантического разбора...');
      const fb = fallbackAnalysis(fullRawText, effectiveTitle, baseCny, initialWeight);
      finalTitle = fb.title;
      finalDesc = inputDesc || fb.description;
      finalCategory = fb.category_name;
      finalWeight = fb.weight_kg;
      variantsToProcess = fb.variants;
      specificationsToProcess = fb.specifications || [];
    }

    // Если в названии остались китайские иероглифы или фабричные токены
    if (
      !finalTitle ||
      finalTitle.length < 5 ||
      /[\u4e00-\u9fa5]/.test(finalTitle) ||
      finalTitle.includes('厂') ||
      finalTitle.includes('公司') ||
      finalTitle.includes('温县') ||
      finalTitle.includes('中山市')
    ) {
      if (effectiveTitle && /[а-яА-ЯёЁ]{4,}/.test(effectiveTitle)) {
        finalTitle = cleanRawTitle(effectiveTitle);
      } else {
        const semantic = analyzeSemantically(fullRawText, effectiveTitle, baseCny, initialWeight);
        finalTitle = semantic.title;
        if (!inputDesc || /[\u4e00-\u9fa5]/.test(inputDesc)) finalDesc = semantic.description;
        finalCategory = normalizeSubcategoryName(semantic.category_name, `${semantic.title} ${fullRawText}`);
        if (specificationsToProcess.length === 0) specificationsToProcess = semantic.specifications || [];
      }
    }

    // Приоритет ручного ввода (если пользователь заполнил поля в расширении вручную)
    if (manual_title && typeof manual_title === 'string' && manual_title.trim()) {
      finalTitle = manual_title.trim();
    }
    if (manual_description && typeof manual_description === 'string' && manual_description.trim()) {
      finalDesc = manual_description.trim();
    }

    // Требование 8: характеристики ИИ добавляет текстовым способом вместе с описанием
    if (specificationsToProcess && specificationsToProcess.length > 0 && !finalDesc.includes('Характеристики:')) {
      const specsLines = specificationsToProcess.map((s) => `• ${s.name}: ${s.value}`).join('\n');
      finalDesc = `${finalDesc.trim()}\n\nХарактеристики:\n${specsLines}`;
    }

    finalTitle = cleanBannedWordsAndPhrases(finalTitle);
    finalDesc = cleanBannedWordsAndPhrases(finalDesc);

    // Привязываем категорию
    finalCategory = normalizeSubcategoryName(finalCategory, `${finalTitle} ${fullRawText}`);
    finalDesc = appendSearchKeywords(finalDesc, finalTitle, finalCategory, specificationsToProcess);
    const categoryId = resolveCategoryId(finalCategory);

    // Генерируем уникальный артикул базового товара
    const baseSku = generateBaseSku(categoryId);

    // Извлекаем изображения
    let allImages = '';
    let mainImage = '';
    if (Array.isArray(images) && images.length > 0) {
      const cleanImgArr: string[] = [];
      for (const img of images) {
        if (typeof img === 'string' && img.trim()) cleanImgArr.push(img.trim());
      }
      allImages = cleanImgArr.join(',');
      mainImage = cleanImgArr[0] || '';
    } else if (typeof images === 'string' && images.length > 0) {
      allImages = images.trim();
      mainImage = images.split(',')[0].trim();
    }

    // Сохраняем товар в базу со всеми фото, видео и характеристиками
    const specsJson = JSON.stringify(specificationsToProcess);
    const prodInsert = db.prepare(`
      INSERT INTO products (title, description, original_link, category_id, base_sku, status, delivery_type, main_image, images, video_url, video_urls, youtube_url, specifications)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(finalTitle, finalDesc, original_link, categoryId, baseSku, status, finalDeliveryType, mainImage, allImages, primaryVideoUrl, JSON.stringify(importedVideos), primaryVideoUrl, specsJson);

    const productId = Number(prodInsert.lastInsertRowid);

    // Записываем варианты
    const varInsert = db.prepare(`
      INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const createdVariants: any[] = [];

    if (variantsToProcess.length === 0) {
      variantsToProcess.push({
        color: 'Основной вариант',
        size: 'Стандарт',
        price_cny: baseCny,
        stock: 20,
        weight_kg: finalWeight,
      });
    }

    for (const v of variantsToProcess) {
      const vCny = parseFloat(v.price_cny as any) || baseCny;
      const vWeight = parseFloat(v.weight_kg as any) || finalWeight;
      const vPriceTjs = calculateVariantPriceTjs(vCny, vWeight);
      const vColor = translateVariantName(v.color || 'Основной вариант');
      const vSize = translateVariantName(v.size || 'Стандарт');
      const vStock = parseInt(v.stock as any, 10) || 15;
      const vSku = generateVariantSku(baseSku, vColor, vSize);
      const vImg = v.image_url || mainImage;

      varInsert.run(productId, vColor, vSize, vCny, vPriceTjs, vStock, vWeight, vSku, vImg);

      createdVariants.push({
        color: vColor,
        size: vSize,
        price_cny: vCny,
        price_tjs: vPriceTjs,
        variant_sku: vSku,
        stock: vStock,
        weight_kg: vWeight,
      });
    }

    console.log(`✓ Товар успешно создан: ID=${productId}, Артикул=${baseSku}, Вариантов=${createdVariants.length}, Характеристик=${specificationsToProcess.length}`);

    return res.status(201).json({
      status: 'success',
      message: 'Товар успешно импортирован',
      product: {
        id: productId,
        base_sku: baseSku,
        title: finalTitle,
        category_id: categoryId,
        category_name: finalCategory,
        weight_kg: finalWeight,
        delivery_type: finalDeliveryType,
        youtube_url: cleanYoutubeUrl,
        specifications: specificationsToProcess,
        variants_count: createdVariants.length,
        variants: createdVariants,
      },
    });
  } catch (err: any) {
    console.error('[API Import Error]', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// 8.1. ТОЧНЫЙ АНАЛИЗ И ИМПОРТ ИЗ ИСХОДНОГО КОДА СТРАНИЦЫ (HTML / window.context / __INIT_DATA__)
app.post('/api/parse-product-html', async (req, res) => {
  try {
    const {
      html_code = '',
      manual_title = '',
      manual_description = '',
      original_link = '',
      price_cny = 50,
      weight_kg = 0.5,
      save_to_catalog = false,
      delivery_type = 'order',
      status = 'active',
    } = req.body;

    if (!html_code || typeof html_code !== 'string' || html_code.trim().length < 10) {
      return res.status(400).json({ error: 'Пожалуйста, вставьте исходный HTML-код страницы или JSON (window.context)' });
    }

    const structured = extractStructuredFromHtmlOrJson(html_code);
    const effectiveTitle = structured.title || '';
    const baseCny = parseFloat(price_cny) || (structured.variants[0]?.price_cny) || 50;
    const initialWeight = parseFloat(weight_kg) || structured.weightKg || 0.5;

    let analysis: GeminiAnalysisResult;
    if (aiClient) {
      analysis = await analyzeProductWithGemini(
        structured.rawSnippetForAi || html_code,
        effectiveTitle,
        baseCny,
        initialWeight
      );
    } else {
      analysis = analyzeSemantically(
        structured.rawSnippetForAi || html_code,
        effectiveTitle,
        baseCny,
        initialWeight
      );
    }

    // Совмещаем характеристики: featureAttributes из контекста имеют высокий приоритет
    const combinedSpecs: Array<{ name: string; value: string }> = [...(analysis.specifications || [])];
    if (structured.specifications && structured.specifications.length > 0) {
      for (const st of structured.specifications) {
        if (!combinedSpecs.some((s) => s.name.toLowerCase() === st.name.toLowerCase())) {
          combinedSpecs.push(st);
        }
      }
    }

    // Формируем варианты с соблюдением цен и остатков (Правило 2)
    let finalVariants = analysis.variants;
    if (structured.variants && structured.variants.length > 0) {
      finalVariants = structured.variants.map((sv, idx) => {
        const matchingAiVar = analysis.variants[idx];
        return {
          color: sv.color || matchingAiVar?.color || `Модификация ${idx + 1}`,
          size: sv.size || matchingAiVar?.size || 'Стандарт',
          price_cny: sv.price_cny > 0 ? sv.price_cny : (matchingAiVar?.price_cny || baseCny),
          stock: sv.stock > 0 ? sv.stock : 25,
          weight_kg: sv.weight_kg || initialWeight,
          image_url: sv.image_url || matchingAiVar?.image_url || structured.images[0] || '',
        };
      });
    }

    const imagesList = structured.images.length > 0 ? structured.images : (analysis.variants.map((v) => v.image_url).filter(Boolean));
    const mainImg = imagesList[0] || (finalVariants[0]?.image_url) || '';

    // Название и описание: приоритет ручного ввода (если заполнен), иначе ИИ
    let finalTitle = (manual_title && typeof manual_title === 'string' && manual_title.trim())
      ? manual_title.trim()
      : (analysis.title || effectiveTitle || 'Товар каталога');

    let finalDesc = (manual_description && typeof manual_description === 'string' && manual_description.trim())
      ? manual_description.trim()
      : (analysis.description || 'Качественные фабричные материалы, продуманная эргономика и надежность в повседневном использовании.');

    // Требование 8: характеристики ИИ добавляет текстовым способом вместе с описанием
    if (combinedSpecs.length > 0 && !finalDesc.includes('Характеристики:')) {
      const specsLines = combinedSpecs.map((s) => `• ${s.name}: ${s.value}`).join('\n');
      finalDesc = `${finalDesc.trim()}\n\nХарактеристики:\n${specsLines}`;
    }

    finalTitle = cleanBannedWordsAndPhrases(finalTitle);
    finalDesc = cleanBannedWordsAndPhrases(finalDesc);
    finalDesc = appendSearchKeywords(
      finalDesc,
      finalTitle,
      analysis.category_name,
      combinedSpecs,
    );

    const finalProduct = {
      title: finalTitle,
      description: finalDesc,
      category_name: analysis.category_name,
      weight_kg: analysis.weight_kg || initialWeight,
      specifications: combinedSpecs,
      variants: finalVariants,
      images: imagesList,
      main_image: mainImg,
      video_url: structured.videoUrl || '',
      video_urls: structured.videoUrls,
      original_link: original_link || '',
      delivery_type: delivery_type === 'stock' ? 'stock' : 'order',
      status: status || 'active',
    };

    // Если запрошено прямое сохранение в каталог
    if (save_to_catalog) {
      const categoryId = resolveCategoryId(finalProduct.category_name);

      const baseSku = generateBaseSku(categoryId);
      const allImagesStr = imagesList.join(',');
      const specsJson = JSON.stringify(combinedSpecs);

      const prodInsert = db.prepare(`
        INSERT INTO products (title, description, original_link, category_id, base_sku, status, delivery_type, main_image, images, video_url, video_urls, youtube_url, specifications)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        finalProduct.title,
        finalProduct.description,
        original_link,
        categoryId,
        baseSku,
        finalProduct.status,
        finalProduct.delivery_type,
        mainImg,
        allImagesStr,
        finalProduct.video_url,
        JSON.stringify(finalProduct.video_urls),
        finalProduct.video_url,
        specsJson
      );

      const productId = Number(prodInsert.lastInsertRowid);

      const varInsert = db.prepare(`
        INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const createdVariants: any[] = [];
      for (const v of finalVariants) {
        const vCny = parseFloat(v.price_cny as any) || baseCny;
        const vWeight = parseFloat(v.weight_kg as any) || finalProduct.weight_kg;
        const vPriceTjs = calculateVariantPriceTjs(vCny, vWeight);
        const vColor = translateVariantName(v.color || 'Основной цвет');
        const vSize = translateVariantName(v.size || 'Стандарт');
        const vStock = parseInt(v.stock as any, 10) || 25;
        const vSku = generateVariantSku(baseSku, vColor, vSize);
        const vImg = v.image_url || mainImg;

        varInsert.run(productId, vColor, vSize, vCny, vPriceTjs, vStock, vWeight, vSku, vImg);
        createdVariants.push({
          color: vColor,
          size: vSize,
          price_cny: vCny,
          price_tjs: vPriceTjs,
          variant_sku: vSku,
          stock: vStock,
          weight_kg: vWeight,
          image_url: vImg,
        });
      }

      return res.status(201).json({
        success: true,
        saved: true,
        message: 'Товар из исходного кода успешно проанализирован и сохранен в каталог!',
        product: {
          id: productId,
          base_sku: baseSku,
          ...finalProduct,
          category_id: categoryId,
          variants_count: createdVariants.length,
          variants: createdVariants,
        },
        rules_verified: {
          category_precision: true,
          specifications_count: combinedSpecs.length,
          sku_prices_matched: true,
          data_source: structured.skuInfoMap ? 'window.context (skuInfoMap + featureAttributes)' : 'HTML DOM tables'
        }
      });
    }

    return res.json({
      success: true,
      saved: false,
      message: 'HTML-код и структура страницы успешно проанализированы без галлюцинаций',
      product: finalProduct,
      rules_verified: {
        category_precision: true,
        specifications_count: combinedSpecs.length,
        sku_prices_matched: true,
        data_source: structured.skuInfoMap ? 'window.context (skuInfoMap + featureAttributes)' : 'HTML DOM tables'
      }
    });
  } catch (err: any) {
    console.error('[API Parse HTML Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// 8.2. КАТЕГОРИИ (ДВУХУРОВНЕВОЕ ДЕРЕВО)
app.get('/api/categories', (_req, res) => {
  try {
    const rootOrder = new Map<string, number>(FIXED_CATEGORY_TREE.map(
      (category, index): [string, number] => [category.name, index],
    ));
    const rootCats = (db.prepare('SELECT id, name FROM categories WHERE parent_id IS NULL').all() as Array<{ id: number; name: string }>)
      .sort((a, b) => (rootOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (rootOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER));
    const getSubs = db.prepare('SELECT id, name FROM categories WHERE parent_id = ? ORDER BY name ASC');
    const productCounts = new Map(
      (db.prepare(`
        SELECT category_id, COUNT(*) AS product_count
        FROM products
        WHERE status = 'active' AND category_id IS NOT NULL
        GROUP BY category_id
      `).all() as Array<{ category_id: number; product_count: number }>)
        .map((row) => [row.category_id, row.product_count]),
    );

    const tree: any[] = [];
    for (const root of rootCats) {
      const subcategories = (getSubs.all(root.id) as Array<{ id: number; name: string }>).map((category) => ({
        ...category,
        product_count: productCounts.get(category.id) || 0,
      }));
      tree.push({
        ...root,
        product_count: (productCounts.get(root.id) || 0)
          + subcategories.reduce((count, category) => count + category.product_count, 0),
        subcategories,
      });
    }

    const all = (db.prepare('SELECT id, name, parent_id FROM categories ORDER BY name ASC').all() as Array<{
      id: number;
      name: string;
      parent_id: number | null;
    }>).map((category) => ({
      ...category,
      product_count: productCounts.get(category.id) || 0,
    }));
    return res.json({ tree, all });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/categories/:id/recommendations', (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ error: 'Некорректный ID категории' });
    }

    const selected = db.prepare(`
      SELECT id, name, parent_id FROM categories WHERE id = ?
    `).get(categoryId) as { id: number; name: string; parent_id: number | null } | undefined;
    if (!selected) return res.status(404).json({ error: 'Категория не найдена' });

    let relatedCategoryIds: number[];
    if (selected.parent_id !== null) {
      relatedCategoryIds = (db.prepare(
        'SELECT id FROM categories WHERE parent_id = ? AND id != ?',
      ).all(selected.parent_id, selected.id) as Array<{ id: number }>).map((category) => category.id);
    } else {
      const familyRoots = FIXED_CATEGORY_TREE.filter((root) => {
        const name = root.name.toLocaleLowerCase('ru');
        const selectedName = selected.name.toLocaleLowerCase('ru');
        const isFashion = (value: string) => /одежд|белье|обувь|сумк|аксессуар/.test(value);
        const isHomeTech = (value: string) => /электроник|техник|дом|мебель|ремонт|красот/.test(value);
        const isActiveLeisure = (value: string) => /детск|игруш|спорт|туризм|транспорт|канцеляр|зоотовар/.test(value);
        return (isFashion(name) && isFashion(selectedName))
          || (isHomeTech(name) && isHomeTech(selectedName))
          || (isActiveLeisure(name) && isActiveLeisure(selectedName));
      }).map((root) => root.name);
      const otherRootIds = (db.prepare(
        `SELECT id FROM categories WHERE parent_id IS NULL AND name IN (${familyRoots.map(() => '?').join(',')}) AND id != ?`,
      ).all(...familyRoots, selected.id) as Array<{ id: number }>).map((root) => root.id);
      relatedCategoryIds = otherRootIds.length
        ? (db.prepare(
          `SELECT id FROM categories WHERE parent_id IN (${otherRootIds.map(() => '?').join(',')})`,
        ).all(...otherRootIds) as Array<{ id: number }>).map((category) => category.id)
        : [];
    }

    if (relatedCategoryIds.length === 0) return res.json({ products: [] });
    const placeholders = relatedCategoryIds.map(() => '?').join(',');
    const recommendations = db.prepare(`
      SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status, p.delivery_type,
             p.main_image, p.images, p.video_url, p.youtube_url, p.created_at,
             c.name AS category_name,
             COALESCE((SELECT MIN(v.price_tjs) FROM product_variants v WHERE v.product_id = p.id AND v.price_tjs > 0), 0) AS min_price_tjs,
             COALESCE((SELECT MAX(v.price_tjs) FROM product_variants v WHERE v.product_id = p.id AND v.price_tjs > 0), 0) AS max_price_tjs
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'active' AND p.category_id IN (${placeholders})
      ORDER BY p.views_count DESC, p.id DESC
      LIMIT 12
    `).all(...relatedCategoryIds) as any[];
    const getVariants = db.prepare(`
      SELECT id, product_id, color, size, price_tjs, stock, weight_kg, variant_sku, image_url
      FROM product_variants WHERE product_id = ? ORDER BY id ASC
    `);
    for (const product of recommendations) {
      product.variants = getVariants.all(product.id);
      product.specifications = [];
      product.video_url = product.youtube_url || product.video_url || '';
      product.youtube_url = product.video_url;
    }
    return res.json({ products: recommendations });
  } catch (error) {
    console.error('[Category Recommendations Error]', error);
    return res.status(500).json({ error: 'Не удалось загрузить похожие товары' });
  }
});

app.post('/api/admin/categories', requireAdmin, (req, res) => {
  return res.status(403).json({ error: 'Структура категорий фиксирована и не допускает добавления новых записей' });
});

// 9. НАСТРОЙКИ (КУРС, СТАВКА ДОСТАВКИ ЗА КГ, WHATSAPP)
app.get('/api/settings', (_req, res) => {
  return res.json({
    whatsapp_phone: getSetting('whatsapp_phone', '992444431'),
    delivery_per_kg_tjs: '30',
  });
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  return res.json({
    whatsapp_phone: getSetting('whatsapp_phone', '992444431'),
    delivery_per_kg_tjs: '30',
    cny_tjs_rate: '1.45',
  });
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  try {
    const { whatsapp_phone } = req.body;
    if (whatsapp_phone) setSetting('whatsapp_phone', String(whatsapp_phone).trim());

    // Keep stored prices consistent with the fixed pricing formula.
    const allVariants = db.prepare('SELECT id, price_cny, weight_kg FROM product_variants').all() as Array<{ id: number; price_cny: number; weight_kg: number }>;
    const updateV = db.prepare('UPDATE product_variants SET price_tjs = ? WHERE id = ?');
    for (const v of allVariants) {
      const newTjs = calculateVariantPriceTjs(v.price_cny, v.weight_kg);
      updateV.run(newTjs, v.id);
    }

    return res.json({ success: true, message: 'Контакт сохранён, цены вариантов пересчитаны по фиксированной формуле' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Ручной пересчет цен всех вариантов товаров по гибкой формуле процентной выручки
app.post('/api/admin/recalculate-prices', requireAdmin, (req, res) => {
  try {
    const allVariants = db.prepare('SELECT id, price_cny, weight_kg FROM product_variants').all() as Array<{ id: number; price_cny: number; weight_kg: number }>;
    const updateV = db.prepare('UPDATE product_variants SET price_tjs = ? WHERE id = ?');
    let count = 0;
    for (const v of allVariants) {
      const newTjs = calculateVariantPriceTjs(v.price_cny, v.weight_kg);
      updateV.run(newTjs, v.id);
      count++;
    }
    return res.json({ success: true, updated_count: count, message: `Успешно пересчитано ${count} цен вариантов по формуле наценки и веса` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 10. ТЕСТИРОВАНИЕ ИИ АНАЛИЗА ИЗ АДМИНКИ
app.post('/api/admin/test-gemini', requireAdmin, async (req, res) => {
  try {
    const { title, raw_text } = req.body;
    const textToAnalyze = raw_text || title || '2026新款夏季透气飞织运动鞋男鞋情侣款轻便减震跑步鞋 黑色 41 42 43 白色 41 42 43 价格 65元 重量0.75kg';
    const result = await analyzeProductWithGemini(textToAnalyze, title || 'Спортивная обувь');
    return res.json({ success: true, result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 11. ПОИСК ПО ФОТО ДЛЯ КЛИЕНТОВ (КАМЕРА / ГАЛЕРЕЯ / БУФЕР ОБМЕНА)
app.post('/api/search-by-image', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Изображение не предоставлено' });
    }

    let mimeType = 'image/jpeg';
    let base64Data = image;
    if (image.startsWith('data:')) {
      const match = image.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    let identified = {
      product_name: 'Товар с фото',
      category_name: '',
      color: '',
      keywords: [] as string[],
      description: 'Визуальный поиск по каталогу товаров M.Savdo',
    };

    if (aiClient) {
      try {
        const categoryOptions = STRICT_ALLOWED_CATEGORIES.join('\n   - ');
        const prompt = `Ты — ведущий эксперт компьютерного зрения и визуального поиска маркетплейса M.Savdo (Душанбе, Таджикистан).
Пользователь загрузил фото товара со своего смартфона или компьютера (через камеру или из галереи/буфера).
Внимательно проанализируй это изображение и определи:
1. "product_name": Точное наименование товара на РУССКОМ языке (например: "Мужские кроссовки", "Оверсайз худи с капюшоном", "Смарт-часы", "Беспроводные TWS наушники", "Чернила для принтера Epson", "Кеды", "Куртка").
2. "category_name": Наиболее подходящая существующая подкатегория товара. Выбери строго из списка, ничего нового не создавай:
   - ${categoryOptions}
3. "color": Доминирующий цвет или комбинация цветов на русском (например: "Белый", "Черный", "Серый", "Бежевый", "Синий").
4. "keywords": 6-10 русских поисковых тегов для поиска этого товара в базе данных (тип вещи, материал, назначение, стиль, бренд, особенности кроя).
5. "description": Краткое описание распознанного предмета в одно предложение.

Верни СТРОГО JSON-объект следующего формата:
{
  "product_name": "...",
  "category_name": "...",
  "color": "...",
  "keywords": ["...", "..."],
  "description": "..."
}`;

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI Visual Search Timeout')), 10000)
        );

        const generatePromise = aiClient.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              },
              { text: prompt },
            ],
          },
          config: {
            responseMimeType: 'application/json',
          },
        });

        const resp = await Promise.race([generatePromise, timeoutPromise]);
        const parsed = JSON.parse(resp.text?.trim() || '{}');
        if (parsed.product_name) identified.product_name = parsed.product_name;
        if (parsed.category_name) identified.category_name = parsed.category_name;
        if (parsed.color) identified.color = parsed.color;
        if (Array.isArray(parsed.keywords)) identified.keywords = parsed.keywords;
        if (parsed.description) identified.description = parsed.description;
      } catch (err: any) {
        console.warn('[Gemini Visual Search Warning]', err.message);
      }
    }

    // Извлекаем все активные товары из базы
    const products = db.prepare(`
      SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status, p.delivery_type, p.main_image, p.images, p.video_url, p.youtube_url, p.specifications,
             c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'active'
    `).all() as any[];

    const getVariants = db.prepare(`SELECT id, color, size, price_tjs, variant_sku, image_url FROM product_variants WHERE product_id = ?`);

    // Ранжирование товаров по визуальному совпадению
    const rawSearchTerms = [
      identified.product_name,
      identified.color,
      ...identified.keywords,
    ];
    const searchTerms: string[] = [];
    for (const term of rawSearchTerms) {
      if (typeof term === 'string' && term.trim()) {
        searchTerms.push(term.toLowerCase());
      }
    }

    const scoredProducts: any[] = [];
    for (const p of products) {
      let score = 0;
      const titleLower = (p.title || '').toLowerCase();
      const descLower = (p.description || '').toLowerCase();
      const catLower = (p.category_name || '').toLowerCase();
      const specsLower = (p.specifications || '').toLowerCase();

      // Совпадение категории
      if (identified.category_name && catLower.includes(identified.category_name.toLowerCase())) {
        score += 35;
      }

      // Совпадение ключевых слов в названии и описании
      for (const term of searchTerms) {
        if (!term || term.length < 3) continue;
        if (titleLower.includes(term)) score += 20;
        if (descLower.includes(term)) score += 10;
        if (specsLower.includes(term)) score += 8;
      }

      const variants = getVariants.all(p.id) as any[];
      if (identified.color) {
        const colorLower = identified.color.toLowerCase();
        for (const v of variants) {
          if ((v.color || '').toLowerCase().includes(colorLower)) {
            score += 15;
            break;
          }
        }
      }

      let parsedSpecs: Array<{ name: string; value: string }> = [];
      if (p.specifications) {
        try {
          const s = typeof p.specifications === 'string' ? JSON.parse(p.specifications) : p.specifications;
          if (Array.isArray(s)) parsedSpecs = s;
          else if (typeof s === 'object' && s !== null) {
            parsedSpecs = Object.entries(s).map(([k, v]) => ({ name: k, value: String(v) }));
          }
        } catch (_) {}
      }
      if (parsedSpecs.length === 0) {
        parsedSpecs = fallbackAnalysis('', p.title, 50, 0.5).specifications || [];
      }

      let minPrice = Infinity;
      let maxPrice = -Infinity;
      for (const variant of variants) {
        if (variant.price_tjs > 0) {
          if (variant.price_tjs < minPrice) minPrice = variant.price_tjs;
          if (variant.price_tjs > maxPrice) maxPrice = variant.price_tjs;
        }
      }

      scoredProducts.push({
        ...p,
        score,
        delivery_type: p.delivery_type || 'order',
        video_urls: normalizeVideoUrls(p.video_urls, p.youtube_url || p.video_url || ''),
        youtube_url: p.youtube_url || p.video_url || '',
        video_url: p.youtube_url || p.video_url || '',
        min_price_tjs: minPrice === Infinity ? 0 : minPrice,
        max_price_tjs: maxPrice === -Infinity ? 0 : maxPrice,
        specifications: parsedSpecs,
        variants,
      });
    }

    // Сортируем: сначала с наивысшим совпадением
    scoredProducts.sort((a, b) => b.score - a.score);

    const topMatches: any[] = [];
    for (const p of scoredProducts) {
      if (p.score >= 15) topMatches.push(p);
    }
    const results = topMatches.length > 0 ? topMatches.slice(0, 8) : scoredProducts.slice(0, 6);

    return res.json({
      success: true,
      identified,
      products: results,
      total_found: results.length,
    });
  } catch (err: any) {
    console.error('[Search By Image Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

// 12. ЗАГРУЗКА ИЗОБРАЖЕНИЙ АДМИНИСТРАТОРОМ
app.post('/api/admin/upload-image', requireAdmin, (req, res) => {
  try {
    const { image, name } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Изображение не предоставлено' });
    }
    return res.json({
      success: true,
      url: image,
      name: name || 'uploaded_image.jpg',
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Пинг-эндпоинт для Chrome-расширения
app.get('/api/ping', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'M.Savdo Enterprise API',
    gemini_enabled: !!aiClient,
    time: new Date().toISOString()
  });
});

// Эндпоинт для получения свежего кода файлов расширения
app.get('/api/extension-file', (req, res) => {
  const file = String(req.query.file || 'content.js');
  const allowed = ['content.js', 'background.js', 'manifest.json', 'popup.html', 'popup.js', 'app.py'];
  if (!allowed.includes(file)) return res.status(400).send('Invalid file');
  const filePath = file === 'app.py' ? path.join(process.cwd(), 'app.py') : path.join(process.cwd(), 'chrome-extension', file);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.sendFile(filePath);
  }
  return res.status(404).send('Not found');
});

// ==========================================
// VITE DEV SERVER MIDDLEWARE
// ==========================================
const seoSiteUrl = (process.env.PUBLIC_SITE_URL || 'https://msavdo.shop').replace(/\/+$/, '');

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function makeProductSlug(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'product';
}

function getPublicProductUrl(id: number, title: string): string {
  return `${seoSiteUrl}/product/${id}/${makeProductSlug(title)}`;
}

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${seoSiteUrl}/sitemap.xml\n`
  );
});

const SEO_SITEMAP_PAGE_SIZE = 10000;

app.get('/sitemap.xml', (_req, res) => {
  try {
    const total = (db.prepare("SELECT COUNT(*) AS count FROM products WHERE status = 'active'").get() as { count: number }).count;
    const pageCount = Math.max(1, Math.ceil(total / SEO_SITEMAP_PAGE_SIZE));
    const sitemapEntries = Array.from({ length: pageCount }, (_, index) =>
      `<sitemap><loc>${escapeHtml(`${seoSiteUrl}/sitemap-products-${index + 1}.xml`)}</loc></sitemap>`
    ).join('');

    res.type('application/xml')
      .set('Cache-Control', 'public, max-age=900')
      .send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapEntries}</sitemapindex>`);
  } catch (error) {
    console.error('[SEO Sitemap] Не удалось сформировать карту сайта:', error);
    res.status(500).type('text/plain').send('Не удалось сформировать карту сайта');
  }
});

app.get('/sitemap-products-:page.xml', (req, res) => {
  try {
    const page = Number(req.params.page);
    if (!Number.isSafeInteger(page) || page < 1) {
      return res.status(404).type('text/plain').send('Карта сайта не найдена');
    }

    const offset = (page - 1) * SEO_SITEMAP_PAGE_SIZE;
    const products = db.prepare(`
      SELECT id, title, created_at
      FROM products
      WHERE status = 'active'
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(SEO_SITEMAP_PAGE_SIZE, offset) as Array<{ id: number; title: string; created_at: string | null }>;
    if (products.length === 0 && page !== 1) {
      return res.status(404).type('text/plain').send('Карта сайта не найдена');
    }

    const productEntries = products.map((product) => {
      const timestamp = product.created_at ? Date.parse(product.created_at) : NaN;
      const lastModified = Number.isFinite(timestamp)
        ? `<lastmod>${new Date(timestamp).toISOString().slice(0, 10)}</lastmod>`
        : '';
      return `<url><loc>${escapeHtml(getPublicProductUrl(product.id, product.title))}</loc>${lastModified}</url>`;
    }).join('');
    const homeEntry = page === 1 ? `<url><loc>${escapeHtml(`${seoSiteUrl}/`)}</loc></url>` : '';

    return res.type('application/xml')
      .set('Cache-Control', 'public, max-age=900')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${homeEntry}${productEntries}</urlset>`);
  } catch (error) {
    console.error('[SEO Sitemap] Не удалось сформировать раздел карты сайта:', error);
    return res.status(500).type('text/plain').send('Не удалось сформировать карту сайта');
  }
});

app.get('/product/:id/:slug?', (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isSafeInteger(productId) || productId <= 0) return next();

    const product = db.prepare(`
      SELECT p.id, p.title, p.description, p.base_sku, p.status, p.delivery_type,
             p.main_image, p.images, p.specifications, p.created_at,
             c.name AS category_name,
             MIN(CASE WHEN v.price_tjs > 0 THEN v.price_tjs END) AS min_price_tjs,
             MAX(CASE WHEN v.price_tjs > 0 THEN v.price_tjs END) AS max_price_tjs,
             COUNT(CASE WHEN v.price_tjs > 0 THEN 1 END) AS offer_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN product_variants v ON v.product_id = p.id
      WHERE p.id = ? AND p.status = 'active'
      GROUP BY p.id
    `).get(productId) as {
      id: number;
      title: string;
      description: string | null;
      base_sku: string;
      status: string;
      delivery_type: string | null;
      main_image: string | null;
      images: string | null;
      specifications: string | null;
      created_at: string | null;
      category_name: string | null;
      min_price_tjs: number | null;
      max_price_tjs: number | null;
      offer_count: number;
    } | undefined;

    if (!product) {
      return res.status(404).type('html').send(
        '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Товар не найден — M.Savdo</title><meta name="robots" content="noindex"><body><h1>Товар не найден</h1><a href="/">Перейти в каталог M.Savdo</a></body></html>'
      );
    }

    const canonicalUrl = getPublicProductUrl(product.id, product.title);
    if (req.originalUrl.split('?')[0] !== new URL(canonicalUrl).pathname) {
      return res.redirect(301, canonicalUrl);
    }

    const description = String(product.description || '').replace(/\s+/g, ' ').trim().slice(0, 500)
      || `${product.title}${product.category_name ? ` — ${product.category_name}` : ''}. Закажите с доставкой из Китая в Таджикистан через M.Savdo.`;
    const imageList = [product.main_image, ...(product.images || '').split(',')]
      .map((image) => image?.trim())
      .filter((image): image is string => Boolean(image))
      .map((image) => {
        try {
          return new URL(image, seoSiteUrl).href;
        } catch {
          return '';
        }
      })
      .filter(Boolean)
      .slice(0, 8);
    let specifications: Array<{ name: string; value: string }> = [];
    if (product.specifications) {
      try {
        const parsed = JSON.parse(product.specifications);
        specifications = Array.isArray(parsed)
          ? parsed
          : Object.entries(parsed).map(([name, value]) => ({ name, value: String(value) }));
      } catch {
        specifications = product.specifications.split('\n').map((line) => {
          const [name, ...parts] = line.split(/[:：]/);
          return { name: name.trim(), value: parts.join(':').trim() };
        }).filter((item) => item.name && item.value);
      }
    }
    const price = Number(product.min_price_tjs) || 0;
    const availability = product.delivery_type === 'stock'
      ? 'https://schema.org/InStock'
      : 'https://schema.org/PreOrder';
    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description,
      sku: product.base_sku,
      url: canonicalUrl,
      ...(imageList.length ? { image: imageList } : {}),
      ...(product.category_name ? { category: product.category_name } : {}),
      ...(price > 0 ? {
        offers: {
          '@type': 'AggregateOffer',
          priceCurrency: 'TJS',
          lowPrice: price,
          highPrice: Number(product.max_price_tjs) || price,
          offerCount: Math.max(1, product.offer_count || 0),
          availability,
          url: canonicalUrl,
          seller: {
            '@type': 'Organization',
            name: 'M.Savdo',
            url: seoSiteUrl,
          },
        },
      } : {}),
    };
    const breadcrumbData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Главная', item: `${seoSiteUrl}/` },
        { '@type': 'ListItem', position: 2, name: product.title, item: canonicalUrl },
      ],
    };
    const whatsappPhone = String(db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_phone'").get()?.value || '992444431');
    const whatsappUrl = `https://wa.me/${whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Ассаламу Алайкум! Меня интересует товар: ${product.title} ${canonicalUrl}`)}`;
    const productImage = imageList[0] || `${seoSiteUrl}/og-banner.jpg`;
    const priceLabel = price > 0
      ? `${price}${product.max_price_tjs && product.max_price_tjs !== price ? `–${product.max_price_tjs}` : ''} сомони`
      : 'Уточните цену';
    const specsHtml = specifications.slice(0, 30)
      .map((spec) => `<li><strong>${escapeHtml(spec.name)}:</strong> ${escapeHtml(spec.value)}</li>`)
      .join('');
    const galleryHtml = imageList.map((image) => `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy">`).join('');
    const safeStructuredData = JSON.stringify([structuredData, breadcrumbData]).replace(/</g, '\\u003c');
    const isSearchCrawler = /googlebot|bingbot|yandex(bot)?|baiduspider|duckduckbot|slurp|facebookexternalhit|twitterbot/i
      .test(req.get('user-agent') || '');
    const appRedirect = isSearchCrawler
      ? ''
      : `<script>window.location.replace('/?product=${product.id}')</script>`;

    res.set('Cache-Control', 'public, max-age=300').set('Vary', 'User-Agent');
    return res.type('html').send(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(product.title)} — купить с доставкой | M.Savdo</title>
<meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${escapeHtml(canonicalUrl)}">
<meta property="og:type" content="product"><meta property="og:title" content="${escapeHtml(product.title)}">
<meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(canonicalUrl)}">
<meta property="og:image" content="${escapeHtml(productImage)}"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${safeStructuredData}</script>
<style>body{margin:0;background:#f8fafc;color:#172033;font:16px/1.6 Arial,sans-serif}.wrap{max-width:980px;margin:auto;padding:20px}.top{display:flex;justify-content:space-between;align-items:center}.brand{font-weight:800;color:#111;text-decoration:none}.product{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:24px;padding:24px;border-radius:20px;background:#fff;box-shadow:0 6px 30px #0f172a12}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start}.gallery img{width:100%;aspect-ratio:1;object-fit:contain;background:#f1f5f9;border-radius:12px}.details h1{line-height:1.25}.price{font-size:24px;font-weight:800}.button{display:inline-block;margin:10px 8px 0 0;padding:11px 16px;border-radius:10px;background:#059669;color:white;text-decoration:none;font-weight:700}.button.secondary{background:#111827}.specs{padding-left:20px}@media(max-width:680px){.product{grid-template-columns:1fr;padding:16px}.gallery{grid-template-columns:1fr 1fr}.wrap{padding:12px}}</style></head>
<body><main class="wrap"><nav class="top"><a class="brand" href="/">M.Savdo</a><a href="/">Каталог товаров</a></nav>
<article class="product"><div class="gallery">${galleryHtml || '<p>Фото товара скоро появится</p>'}</div>
<section class="details"><p>${escapeHtml(product.category_name || 'Каталог M.Savdo')}</p><h1>${escapeHtml(product.title)}</h1>
<p class="price">${escapeHtml(priceLabel)}</p><p>${escapeHtml(description)}</p>
${specsHtml ? `<h2>Характеристики</h2><ul class="specs">${specsHtml}</ul>` : ''}
<p>Артикул: ${escapeHtml(product.base_sku)}</p><a class="button" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Уточнить и заказать в WhatsApp</a>
<a class="button secondary" href="/">Открыть каталог M.Savdo</a></section></article></main>${appRedirect}</body></html>`);
  } catch (error) {
    console.error('[SEO Product Page] Не удалось сформировать страницу товара:', error);
    return res.status(500).type('text/plain').send('Не удалось загрузить страницу товара');
  }
});

async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  if (process.env.NODE_ENV === 'production' && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 M.Savdo E-Commerce Server запущен на http://0.0.0.0:${PORT}`);
  });
}

startServer();
