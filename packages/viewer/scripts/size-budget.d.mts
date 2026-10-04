export const BUDGETS: Record<string, number>;
export const WARN_AT: number;
export interface SizeResult {
  file: string;
  raw: number;
  gzip: number;
  budget: number;
  share: number;
  status: 'ok' | 'warning' | 'over';
}
export function evaluate(
  sizes: { file: string; raw: number; gzip: number }[],
  budgets?: Record<string, number>,
): SizeResult[];
export function table(results: SizeResult[]): string;
