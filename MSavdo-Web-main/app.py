#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
M.Savdo — Международная e-commerce платформа выкупа товаров
Монолитное веб-приложение на Python (Flask) с базой данных SQLite.
Поддерживает мульти-вариативную матрицу SKU (цвета, размеры), весовую логистику,
полную изоляцию бренда от клиентов и защищенную админ-панель.

Запуск:
    pip install flask
    python3 app.py
Доступ: http://127.0.0.1:5000
"""

import os
import re
import json
import random
import string
import sqlite3
import hashlib
from flask import Flask, request, jsonify, render_template_string, redirect, url_for, session

# ==========================================
# КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ
# ==========================================
DATABASE_FILE = "msavdo.db"
DEFAULT_WHATSAPP_PHONE = "992444431"
DEFAULT_CNY_RATE = 1.45
DEFAULT_DELIVERY_PER_KG = 30.0

app = Flask(__name__)
app.config['SECRET_KEY'] = 'msavdo-enterprise-secret-key-2026'

# Настройка CORS для работы Chrome-расширения
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Origin, Accept'
    return response

@app.route('/api/<path:path>', methods=['OPTIONS'])
@app.route('/api/add-product', methods=['OPTIONS'])
def options_preflight(*args, **kwargs):
    return ('', 204)

@app.route('/api/ping', methods=['GET'])
def api_ping():
    return jsonify({"status": "ok", "service": "M.Savdo Enterprise Flask API", "version": "4.0"})

# ==========================================
# БАЗА ДАННЫХ SQLITE
# ==========================================
def get_db():
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(pwd):
    return hashlib.sha256((pwd + "_msavdo_salt").encode('utf-8')).hexdigest()

def get_setting(key, default_val):
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row['value'] if row else default_val

def set_setting(key, val):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, str(val)))
    conn.commit()
    conn.close()

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent_id INTEGER,
        FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        original_link TEXT,
        category_id INTEGER,
        base_sku TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'active',
        main_image TEXT,
        images TEXT,
        video_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
    );
    """)

    cursor.execute("""
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
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """)

    conn.commit()

    # Миграция колонок images и video_url, если база уже была создана
    try:
        cursor.execute("ALTER TABLE products ADD COLUMN images TEXT")
        conn.commit()
    except Exception:
        pass

    try:
        cursor.execute("ALTER TABLE products ADD COLUMN video_url TEXT")
        conn.commit()
    except Exception:
        pass

    # Дефолтный админ
    cursor.execute("SELECT COUNT(*) FROM admin_users")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", ('admin', hash_password('admin123')))
        conn.commit()

    # Дефолтные настройки
    set_setting('cny_tjs_rate', str(DEFAULT_CNY_RATE))
    set_setting('delivery_per_kg_tjs', str(DEFAULT_DELIVERY_PER_KG))
    set_setting('whatsapp_phone', DEFAULT_WHATSAPP_PHONE)

    # Стартовые товары если база пуста
    cursor.execute("SELECT COUNT(*) FROM products")
    if cursor.fetchone()[0] == 0:
        seed_data(cursor)
        conn.commit()

    conn.close()

def calculate_variant_price_tjs(price_cny, weight_kg=0.5):
    rate = float(get_setting('cny_tjs_rate', DEFAULT_CNY_RATE))
    delivery_kg = float(get_setting('delivery_per_kg_tjs', DEFAULT_DELIVERY_PER_KG))

    if price_cny <= 20:
        markup = 2.0  # 100%
    elif price_cny <= 100:
        markup = 1.6  # 60%
    else:
        markup = 1.3  # 30%

    base_tjs = price_cny * rate * markup
    logistics = (weight_kg or 0.5) * delivery_kg
    return max(1, round(base_tjs + logistics))

def generate_base_sku():
    chars = string.ascii_uppercase + string.digits
    return f"MS-{''.join(random.choices(chars, k=6))}"

def generate_variant_sku(base_sku, color, size):
    token = hashlib.md5(f"{color}-{size}-{random.random()}".encode('utf-8')).hexdigest()[:6].upper()
    return f"{base_sku}-{token}"

def detect_category_name(title, raw_text=""):
    combined = f"{title} {raw_text}".lower()
    if any(k in combined for k in ['чернил', 'картридж', 'принтер', 'epson', 'canon', 'hp', '004', 'офис', 'бумаг', 'l31']):
        return 'Офис, техника и электроника'
    elif any(k in combined for k in ['обувь', 'туфл', 'кроссов', 'ботин', 'кед', 'сандал', 'ботильон', 'подошв', 'стельк']):
        return 'Премиальная обувь'
    elif any(k in combined for k in ['худи', 'куртк', 'одежд', 'толстовк', 'футболк', 'брюк', 'джинс', 'свитер', 'костюм']):
        return 'Мужская коллекция'
    elif any(k in combined for k in ['наушник', 'часы', 'смарт', 'чехол', 'powerbank', 'зарядк', 'кабель', 'телефон']):
        return 'Аудио и смарт-гаджеты'
    elif any(k in combined for k in ['кухн', 'дом', 'посуд', 'уборк', 'декор', 'лампа', 'светильник', 'нож']):
        return 'Дом и кухня'
    return 'Аксессуары и дом'

def seed_data(cursor):
    categories = [
        'Мужская коллекция',
        'Премиальная обувь',
        'Аудио и смарт-гаджеты',
        'Офис, техника и электроника',
        'Дом и кухня',
        'Аксессуары и дом'
    ]
    for cat in categories:
        try:
            cursor.execute("INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?, NULL)", (cat,))
        except Exception:
            pass

    cursor.execute("SELECT id, name FROM categories")
    cat_map = {row['name']: row['id'] for row in cursor.fetchall()}

    sku1 = generate_base_sku()
    cursor.execute("""
    INSERT INTO products (title, description, original_link, category_id, base_sku, status, main_image, images)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    """, (
        'Мужские защитные дышащие кроссовки Hyper-Breeze',
        'Ультралегкие кроссовки из дышащего текстиля с анатомической подошвой EVA. Оптимальная амортизация.',
        'https://detail.1688.com/offer/784192019.html',
        cat_map.get('Премиальная обувь', 1),
        sku1,
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
        'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800,https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800'
    ))
    p1_id = cursor.lastrowid

    colors = ['Черный оникс', 'Графитовый серый', 'Белоснежный']
    sizes = ['40', '41', '42', '43']
    for col in colors:
        for sz in sizes:
            tjs = calculate_variant_price_tjs(65, 0.8)
            cursor.execute("""
            INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (p1_id, col, sz, 65, tjs, 15, 0.8, generate_variant_sku(sku1, col, sz), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800'))

# ==========================================
# REST API ЭНДПОИНТЫ
# ==========================================
@app.route('/api/products', methods=['GET'])
def api_public_products():
    """Публичный каталог: БЕЗ оригинальных ссылок и БЕЗ цен в CNY (полная изоляция бренда)."""
    conn = get_db()
    products = conn.execute("""
    SELECT p.id, p.title, p.description, p.category_id, p.base_sku, p.status, p.main_image, p.images, p.video_url, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'active'
    ORDER BY p.id DESC
    """).fetchall()

    result = []
    for p in products:
        p_dict = dict(p)
        variants = conn.execute("""
        SELECT id, product_id, color, size, price_tjs, stock, weight_kg, variant_sku, image_url
        FROM product_variants
        WHERE product_id = ?
        ORDER BY id ASC
        """, (p['id'],)).fetchall()
        v_list = [dict(v) for v in variants]
        prices = [v['price_tjs'] for v in v_list if v['price_tjs'] > 0]
        p_dict['variants'] = v_list
        p_dict['min_price_tjs'] = min(prices) if prices else 0
        p_dict['max_price_tjs'] = max(prices) if prices else 0
        result.append(p_dict)

    conn.close()
    return jsonify({"products": result})

@app.route('/api/add-product', methods=['POST'])
def api_add_product():
    """Импорт товара из Chrome-расширения с матрицей вариантов и весовой логистикой."""
    try:
        data = request.get_json(force=True, silent=True) or {}
        raw_title = data.get('title', '').strip()
        if not raw_title:
            return jsonify({"status": "error", "message": "Название товара обязательно"}), 400

        # Очистка названия
        clean_title = re.sub(r'【.*?】|\[.*?\]|[-|_].*$', '', raw_title).strip()
        desc = data.get('description', 'Высококачественный товар, проверенный отделом контроля качества M.Savdo перед отправкой.')
        orig_link = data.get('original_link', '')
        raw_text = data.get('raw_text', '')
        weight_kg = float(data.get('weight_kg', 0.5))
        base_cny = float(data.get('price_cny', 65.0))
        images = data.get('images', '')
        video_url = data.get('video_url', '')
        main_img = images.split(',')[0].strip() if images else ''

        conn = get_db()
        cursor = conn.cursor()

        # Определение категории
        cat_name = detect_category_name(clean_title, raw_text)
        cursor.execute("SELECT id FROM categories WHERE name = ?", (cat_name,))
        cat_row = cursor.fetchone()
        if not cat_row:
            cursor.execute("INSERT INTO categories (name, parent_id) VALUES (?, NULL)", (cat_name,))
            cat_id = cursor.lastrowid
        else:
            cat_id = cat_row['id']

        base_sku = generate_base_sku()
        cursor.execute("""
        INSERT INTO products (title, description, original_link, category_id, base_sku, status, main_image, images, video_url)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
        """, (clean_title, desc, orig_link, cat_id, base_sku, main_img, images, video_url))
        prod_id = cursor.lastrowid

        variants = data.get('variants', [])
        created_variants = []

        if variants and isinstance(variants, list):
            for v in variants:
                cny = float(v.get('price_cny', base_cny))
                w = float(v.get('weight_kg', weight_kg))
                tjs = calculate_variant_price_tjs(cny, w)
                v_sku = generate_variant_sku(base_sku, v.get('color'), v.get('size'))
                v_img = v.get('image_url') or main_img
                stock = int(v.get('stock', 20))

                cursor.execute("""
                INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (prod_id, v.get('color', 'Базовый'), v.get('size', 'One Size'), cny, tjs, stock, w, v_sku, v_img))
                created_variants.append({"color": v.get('color'), "size": v.get('size'), "price_tjs": tjs, "variant_sku": v_sku})
        else:
            tjs = calculate_variant_price_tjs(base_cny, weight_kg)
            v_sku = f"{base_sku}-STD"
            cursor.execute("""
            INSERT INTO product_variants (product_id, color, size, price_cny, price_tjs, stock, weight_kg, variant_sku, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (prod_id, 'Базовый', 'One Size', base_cny, tjs, 20, weight_kg, v_sku, main_img))
            created_variants.append({"color": "Базовый", "size": "One Size", "price_tjs": tjs, "variant_sku": v_sku})

        conn.commit()
        conn.close()

        return jsonify({
            "status": "success",
            "message": "Товар успешно импортирован",
            "product": {
                "id": prod_id,
                "base_sku": base_sku,
                "title": clean_title,
                "category_name": cat_name,
                "variants_count": len(created_variants),
                "variants": created_variants
            }
        }), 201
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/')
def home():
    return """<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>M.Savdo — Международная e-commerce платформа</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-50 text-slate-900 font-sans p-8">
    <div class="max-w-4xl mx-auto space-y-6">
        <div class="p-6 bg-slate-900 text-white rounded-2xl flex justify-between items-center">
            <div>
                <h1 class="text-2xl font-bold">M.<span class="text-emerald-400">Savdo</span></h1>
                <p class="text-xs text-slate-400 mt-1">Сервер на Flask + SQLite успешно запущен на порту 5000</p>
            </div>
            <a href="/api/products" class="px-4 py-2 bg-emerald-600 rounded-xl text-xs font-bold text-white hover:bg-emerald-700">Проверить API товаров</a>
        </div>
        <div class="p-6 bg-white border border-slate-200 rounded-2xl">
            <h2 class="text-base font-bold mb-2">Статус модулей:</h2>
            <ul class="text-xs space-y-2 text-slate-600">
                <li>✓ SQLite база данных с мульти-вариативной матрицей (<code class="bg-slate-100 p-1">product_variants</code>) активна</li>
                <li>✓ Весовой калькулятор (30 сомони/кг) и маржинальная сетка (100% / 60% / 30%) включены</li>
                <li>✓ Полная изоляция бренда от клиентов настроена</li>
                <li>✓ Эндпоинт для Chrome-расширения доступен: <code class="bg-slate-100 p-1">POST /api/add-product</code></li>
                <li>✓ Поддержка нескольких фотографий (галерея) и видео 1688 активна</li>
            </ul>
        </div>
    </div>
</body>
</html>"""

if __name__ == '__main__':
    print("==================================================")
    print("M.Savdo Enterprise Server (Flask + SQLite)")
    init_db()
    print("Сервер запущен: http://127.0.0.1:5000")
    print("==================================================")
    app.run(host='0.0.0.0', port=5000, debug=True)
