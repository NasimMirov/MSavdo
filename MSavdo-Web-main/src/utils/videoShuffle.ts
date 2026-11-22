function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function shuffleVideoItems<T>(items: T[], seed: string, keyForItem: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const leftKey = keyForItem(left);
    const rightKey = keyForItem(right);
    return hash(`${seed}:${leftKey}`) - hash(`${seed}:${rightKey}`) || leftKey.localeCompare(rightKey);
  });
}
