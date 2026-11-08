export interface ShippingSpecification {
  name: string;
  value: string;
}

const dimensionNamePattern = /габарит|размер.*(?:упаков|автомоб|товар|короб)|длин|ширин|высот|dimension|length|width|height|尺寸|外形|包装/i;
const weightNamePattern = /вес|масса|weight|重量|装载重量|装载质量/i;

function parseNumber(value: string): number {
  return Number(value.replace(',', '.'));
}

function metersPerUnit(unit: string): number {
  if (/^(?:mm|㎜|мм|毫米)$/i.test(unit)) return 0.001;
  if (/^(?:cm|см|厘米)$/i.test(unit)) return 0.01;
  if (/^(?:m|м|米)$/i.test(unit)) return 1;
  return 0;
}

function parseDimensionsToVolume(text: string, context = ''): number {
  const dimensionPattern = /(\d+(?:[.,]\d+)?)\s*(mm|㎜|мм|毫米|cm|см|厘米|m|м|米)?\s*(?:\*|x|×|х)\s*(\d+(?:[.,]\d+)?)\s*(mm|㎜|мм|毫米|cm|см|厘米|m|м|米)?\s*(?:\*|x|×|х)\s*(\d+(?:[.,]\d+)?)\s*(mm|㎜|мм|毫米|cm|см|厘米|m|м|米)?/i;
  const match = text.match(dimensionPattern);
  if (match) {
    const values = [parseNumber(match[1]), parseNumber(match[3]), parseNumber(match[5])];
    const contextUnit = (context.match(/mm|㎜|мм|毫米|cm|см|厘米|m|м|米/i) || [])[0] || '';
    const commonUnit = match[2] || match[4] || match[6] || contextUnit;
    const units = [match[2] || commonUnit, match[4] || commonUnit, match[6] || commonUnit];
    if (units.every(Boolean)) {
      const dimensionsInMeters = values.map((value, index) => value * metersPerUnit(units[index]));
      if (dimensionsInMeters.every((value) => value > 0)) {
        return dimensionsInMeters.reduce((volume, value) => volume * value, 1);
      }
    }
  }

  const volumeMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(m(?:3|³)|м(?:3|³)|cm(?:3|³)|см(?:3|³)|mm(?:3|³)|мм(?:3|³))/i);
  if (volumeMatch && /объ[её]м|volume|体积/i.test(context)) {
    const volume = parseNumber(volumeMatch[1]);
    const unit = volumeMatch[2].toLowerCase();
    if (/^(?:cm|см)/.test(unit)) return volume / 1_000_000;
    if (/^(?:mm|мм)/.test(unit)) return volume / 1_000_000_000;
    return volume;
  }
  return 0;
}

function parseWeightKg(value: string, name: string): number {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(kg|кг|公斤|千克|g|г|克)?/i);
  if (!match) return 0;

  const weight = parseNumber(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (/^(?:g|г|克)$/.test(unit) || (!unit && /(?:\(\s*g\s*\)|\bг\b|克)/i.test(name))) {
    return weight / 1000;
  }
  if (!unit && weight > 1000) return weight / 1000;
  return weight;
}

function parseMeasurementMeters(value: string, name: string): number {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*(mm|㎜|мм|毫米|cm|см|厘米|m|м|米)?/i);
  if (!match) return 0;
  const unit = match[2] || (name.match(/mm|㎜|мм|毫米|cm|см|厘米|m|м|米/i) || [])[0] || '';
  const factor = metersPerUnit(unit);
  return factor ? parseNumber(match[1]) * factor : 0;
}

export function normalizeWeightKg(value: unknown, source = ''): number {
  if (typeof value === 'string') return parseWeightKg(value, source);
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (weight > 1000 || /(?:\(\s*g\s*\)|\bг\b|克)/i.test(source)) return weight / 1000;
  return weight;
}

export function extractShippingMetrics(
  specifications: ShippingSpecification[],
  rawText = '',
): { weightKg: number; volumeM3: number } {
  const dimensionSpecs = specifications.filter((item) =>
    dimensionNamePattern.test(item.name)
      || /объ[её]м|volume|体积/i.test(item.name)
      || /mm|㎜|мм|毫米|厘米|cm|см|×|\*/i.test(item.value),
  );
  let volumeM3 = 0;
  for (const spec of dimensionSpecs) {
    volumeM3 = parseDimensionsToVolume(`${spec.name} ${spec.value}`, spec.name);
    if (volumeM3 > 0) break;
  }

  if (volumeM3 <= 0) {
    const dimensions = { length: 0, width: 0, height: 0 };
    for (const spec of specifications) {
      const name = spec.name.toLowerCase();
      const dimension = parseMeasurementMeters(spec.value, spec.name);
      if (!dimension) continue;
      if (/длин|length|长度/.test(name) || name.includes('长')) dimensions.length = dimension;
      else if (/ширин|width|宽度/.test(name) || name.includes('宽')) dimensions.width = dimension;
      else if (/высот|height|高度/.test(name) || name.includes('高')) dimensions.height = dimension;
    }
    if (dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      volumeM3 = dimensions.length * dimensions.width * dimensions.height;
    }
  }

  if (volumeM3 <= 0 && rawText) {
    volumeM3 = parseDimensionsToVolume(rawText);
  }

  const weightSpecs = specifications
    .filter((item) => weightNamePattern.test(item.name))
    .sort((a, b) => Number(/包装|包裹|货物|装载|gross|package/i.test(b.name)) - Number(/包装|包裹|货物|装载|gross|package/i.test(a.name)));
  let weightKg = 0;
  for (const spec of weightSpecs) {
    weightKg = parseWeightKg(spec.value, spec.name);
    if (weightKg > 0) break;
  }

  return { weightKg, volumeM3 };
}

export function calculateShippingCostTjs(weightKg: number, volumeM3 = 0): number {
  const weight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 0;
  const volume = Number.isFinite(volumeM3) && volumeM3 > 0 ? volumeM3 : 0;
  return Math.round(volume > 0 ? volume * 2000 : weight * 30);
}

export function calculatePriceTjs(priceCny: number, weightKg: number, volumeM3 = 0): number {
  const cny = Number.isFinite(priceCny) && priceCny > 0 ? priceCny : 0;
  return Math.round((cny * 1.45) + calculateShippingCostTjs(weightKg, volumeM3));
}

export function calculateDiscountedPriceTjs(priceTjs: number, discountPercent: number): number {
  if (!Number.isSafeInteger(priceTjs) || priceTjs <= 0 ||
      !Number.isSafeInteger(discountPercent) || discountPercent <= 0 || discountPercent > 90) {
    return priceTjs;
  }
  return Math.max(1, Math.round(priceTjs * (100 - discountPercent) / 100));
}
