type ImportVariant = {
  color?: string;
  size?: string;
  variant_sku?: string;
  sku_id?: string;
  weight_kg?: number;
};

const colorPattern = /color|colour|颜色|顏色|цвет|款式/i;
const sizePattern = /size|尺码|尺寸|размер/i;
const optionSeparators = /\s*(?:>|;|；|\||,|，|\/|\n)\s*/;

export function classifyImportVariant<T extends ImportVariant>(variant: T): T {
  const label = [variant.color, variant.size]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');
  if (!label) return variant;

  const parts = label.split(optionSeparators).map((part) => part.trim()).filter(Boolean);
  const explicitColor = parts.find((part) => colorPattern.test(part));
  const explicitSize = parts.find((part) => sizePattern.test(part));
  const color = explicitColor?.replace(/^(?:color|colour|颜色|顏色|цвет|款式)\s*[:：-]?\s*/i, '').trim();
  const size = explicitSize?.replace(/^(?:size|尺码|尺寸|размер)\s*[:：-]?\s*/i, '').trim();
  const sizePart = parts.find((part) => /^(?:XS|S|M|L|XL|XXL|XXXL|[2-8]XL|均码|均碼|OS|ONE\s*SIZE|\d{1,3}(?:\.\d+)?)$/i.test(part));
  const colorPart = parts.find((part) => /黑|白|灰|蓝|紅|红|绿|黄|粉|紫|棕|咖|米|卡其|black|white|gray|grey|blue|red|green|yellow|pink|purple|brown|beige|khaki|черн|бел|сер|син|красн|зелен|желт|розов|коричн|беж/i.test(part));

  return {
    ...variant,
    color: color || colorPart || variant.color || 'Стандарт',
    size: size || sizePart || variant.size || 'Стандарт',
  };
}

export function normalizeImportVariants<T extends ImportVariant>(
  variants: T[],
  sourceVariants: T[],
  weightKg: number,
): Array<T & { weight_kg: number }> {
  return (sourceVariants.length > 0 ? sourceVariants : variants).map((rawVariant) => {
    const variant = classifyImportVariant(rawVariant);
    return {
      ...variant,
      weight_kg: Number(variant.weight_kg) > 0 ? Number(variant.weight_kg) : weightKg,
    };
  });
}
