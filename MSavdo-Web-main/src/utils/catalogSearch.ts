const hyphens = /[-‐‑‒–—−]/g;

export function catalogSearchTerms(query: string): string[] {
  return [...new Set(query.normalize('NFKC').trim().split(/\s+/).filter(Boolean))];
}

export function escapeSearchLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function catalogSearchPattern(term: string): string {
  const characters = Array.from(/[\p{L}\p{N}]/u.test(term) ? term.replace(hyphens, '') : term);
  return `*${characters.map((character) => {
    if (/^[её]$/iu.test(character)) return '[еЕёЁ]';
    const lower = character.toLocaleLowerCase('ru');
    const upper = character.toLocaleUpperCase('ru');
    if (lower !== upper && Array.from(lower).length === 1 && Array.from(upper).length === 1) {
      return `[${lower}${upper}]`;
    }
    if (character === '[') return '[[]';
    if (character === ']') return '[]]';
    if (character === '*') return '[*]';
    if (character === '?') return '[?]';
    return character;
  }).join('')}*`;
}

export function catalogSearchField(field: string): string {
  return `replace(replace(replace(replace(replace(replace(replace(${field}, '-', ''), '‐', ''), '‑', ''), '‒', ''), '–', ''), '—', ''), '−', '')`;
}

export function catalogSearchCondition(term: string, fields: string[]): { condition: string; patterns: string[] } {
  const pattern = catalogSearchPattern(term);
  const normalizeHyphens = /[\p{L}\p{N}]/u.test(term);
  return {
    condition: `(${fields.map((field) => `${normalizeHyphens ? catalogSearchField(field) : field} GLOB ?`).join(' OR ')})`,
    patterns: fields.map(() => pattern),
  };
}
