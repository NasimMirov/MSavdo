#!/usr/bin/env python3
"""Deterministic Somon category classifier.

Reads one JSON object from stdin and writes one JSON object to stdout.
The caller supplies the current official category snapshot.
"""
import json
import re
import sys
import unicodedata

FORBIDDEN = ()
STOP = {
    "и", "в", "во", "на", "для", "из", "с", "со", "по", "под", "до", "от", "the", "and", "for", "with", "of",
    "товар", "товары", "категория", "новый", "новая", "новое", "новые", "комплект", "набор", "шт", "шт.",
}
ALIASES = {
    "фонарь": {"светильник", "освещение", "туризм", "кемпинг"},
    "кемпинг": {"туризм", "пикник", "палатка", "поход"},
    "наушник": {"гарнитура", "аудио"},
    "зарядка": {"зарядное", "кабель", "питание"},
    "телефон": {"связь", "аксессуар"},
    "рюкзак": {"сумка", "туризм"},
    "кроссовка": {"обувь"},
    "кроссовки": {"обувь"},
    "кроссов": {"обувь"},
    "пылесос": {"уборка"},
    "лампа": {"освещение", "светильник"},
    "лампы": {"освещение", "светильник"},
}


def fold(value):
    value = unicodedata.normalize("NFKC", str(value or "")).lower().replace("ё", "е")
    return re.sub(r"[^\wЀ-ӿ㐀-鿿]+", " ", value, flags=re.UNICODE)


def tokens(value):
    result = []
    for token in fold(value).split():
        if len(token) < 3 or token in STOP or token.isdigit():
            continue
        result.append(token)
        for alias in ALIASES.get(token, ()):
            result.append(alias)
    return set(result)


def source_text(payload):
    fields = []
    for key, weight in (("title", 5), ("category_hint", 3), ("description", 2)):
        value = payload.get(key, "")
        fields.extend([str(value)] * weight)
    specs = payload.get("specifications", [])
    if isinstance(specs, list):
        for item in specs[:100]:
            if isinstance(item, dict):
                fields.append(f"{item.get('name', '')} {item.get('value', '')}")
    return " ".join(fields)


def classify(payload):
    categories = payload.get("categories")
    if not isinstance(categories, list):
        return {"status": "error", "reason": "categories_missing"}
    rows = [row for row in categories if isinstance(row, dict) and isinstance(row.get("path"), str) and str(row["path"]).strip()]
    if not rows:
        return {"status": "unclassified", "reason": "categories_empty", "path": None, "rubric_id": None, "confidence": 0.0}

    text = source_text(payload)
    text_tokens = tokens(text)
    if any(pattern.search(text) for pattern in FORBIDDEN):
        return {"status": "forbidden", "reason": "excluded_product_branch", "path": None, "rubric_id": None, "confidence": 0.0}

    title_tokens = tokens(payload.get("title", ""))
    hint_tokens = tokens(payload.get("category_hint", ""))
    scored = []
    for row in rows:
        path = row["path"]
        path_tokens = tokens(path)
        if not path_tokens:
            continue
        title_hits = len(title_tokens & path_tokens)
        hint_hits = len(hint_tokens & path_tokens)
        all_hits = len(text_tokens & path_tokens)
        # A title hit is stronger than a generic description hit. Common root words
        # are removed above, so a match must describe both the product and the path.
        score = title_hits * 5.0 + hint_hits * 2.5 + all_hits * 0.8
        leaf = tokens(path.split(" / ")[-1])
        if leaf and leaf.issubset(title_tokens):
            score += 4.0
        scored.append((score, title_hits, all_hits, row))

    scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    if not scored or scored[0][0] < 5.0:
        return {"status": "unclassified", "reason": "insufficient_signal", "path": None, "rubric_id": None, "confidence": 0.0}

    best = scored[0]
    second = scored[1][0] if len(scored) > 1 else 0.0
    margin = best[0] - second
    confidence = min(0.99, max(0.0, 0.45 + min(best[0], 20.0) / 40.0 + min(margin, 10.0) / 20.0))
    if best[1] == 0 or margin < 2.0 or confidence < 0.68:
        return {"status": "ambiguous", "reason": "close_category_candidates", "path": None, "rubric_id": None, "confidence": round(confidence, 4)}

    row = best[3]
    rubric_id = row.get("rubric_id")
    if not isinstance(rubric_id, int) or rubric_id <= 0:
        return {"status": "unclassified", "reason": "invalid_rubric_id", "path": None, "rubric_id": None, "confidence": 0.0}
    return {"status": "classified", "reason": "weighted_official_path_match", "path": row["path"], "rubric_id": rubric_id, "confidence": round(confidence, 4)}


def main():
    try:
        payload = json.load(sys.stdin)
        result = classify(payload if isinstance(payload, dict) else {})
    except Exception as exc:
        result = {"status": "error", "reason": "invalid_input", "detail": str(exc)[:200]}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
