export function normalizeImportVariants<T extends { weight_kg?: number }>(
  variants: T[],
  sourceVariants: T[],
  weightKg: number,
): Array<T & { weight_kg: number }> {
  return (sourceVariants.length > 0 ? sourceVariants : variants).map((variant) => ({
    ...variant,
    weight_kg: Number(variant.weight_kg) > 0 ? Number(variant.weight_kg) : weightKg,
  }));
}
