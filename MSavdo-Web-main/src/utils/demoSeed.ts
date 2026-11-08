export function shouldSeedDemoProducts(environment: string | undefined, productCount: number): boolean {
  return environment !== 'production' && productCount === 0;
}
