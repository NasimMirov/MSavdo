export function importVariantInstructions(hasSourceVariants: boolean, visualSkuMap: unknown[]): {
  instructions: string;
  schema: string;
} {
  if (hasSourceVariants) {
    return {
      instructions: 'Варианты SKU уже извлечены из источника и будут сохранены отдельно. Не перечисляй их в ответе.',
      schema: '',
    };
  }
  return {
    instructions: `6. "variants": Сохрани каждый подтверждённый вариант SKU: цвет, размер, комплектацию и другие отличия. Переведи названия на русский, цены укажи 0, неизвестный остаток — 0. Фото сопоставляй только по точному соответствию из visual_sku_map, иначе оставь image_url пустым.
Карта соответствия цветов и фотографий visual_sku_map:
${JSON.stringify(visualSkuMap)}`,
    schema: `,
  "variants": [
    { "color": "Цвет / Модификация", "size": "Размер", "price_cny": 0, "stock": 0, "weight_kg": 0.5, "image_url": "" }
  ]`,
  };
}
