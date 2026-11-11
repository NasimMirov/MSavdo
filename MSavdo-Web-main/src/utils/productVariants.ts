import type { ProductVariant } from '../types';

export function orderableVariants(variants: ProductVariant[]): ProductVariant[] {
  return variants.filter((variant) => Number.isSafeInteger(variant.id) && Number(variant.id) > 0
    && Number.isSafeInteger(variant.price_tjs) && variant.price_tjs > 0)
    .map((variant) => ({ ...variant, color: variant.color ?? '', size: variant.size ?? '' }));
}

export function resolveVariant(
  variants: ProductVariant[],
  selectedColor: string,
  selectedSize: string,
): ProductVariant | undefined {
  const colors = variants.filter((variant) => variant.color === selectedColor);
  const choices = colors.length ? colors : variants;
  return choices.find((variant) => variant.size === selectedSize) || choices[0];
}
