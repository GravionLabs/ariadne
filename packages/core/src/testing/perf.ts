/** Share of a budget above which a benchmark warns, while it still passes. */
export const WARN_AT = 0.7;

export interface MeasureOptions {
  /** Timed runs; the median of them is the result. */
  runs?: number;
  /** Runs before the timed ones, so that JIT compilation and caches are not measured. */
  warmup?: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** The median time of `fn` in milliseconds over `runs` runs, after `warmup` runs that are dropped. */
export function measure(fn: () => unknown, { runs = 7, warmup = 2 }: MeasureOptions = {}): number {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

/** Like {@link measure}, for work that is finished when the returned promise resolves. */
export async function measureAsync(
  fn: () => Promise<unknown>,
  { runs = 7, warmup = 2 }: MeasureOptions = {},
): Promise<number> {
  for (let i = 0; i < warmup; i++) await fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return median(times);
}

const format = (ms: number): string => (ms < 10 ? ms.toFixed(1) : Math.round(ms).toString());

/**
 * Fails when `medianMs` is over `budgetMs`; above {@link WARN_AT} of it the test passes but a GitHub
 * annotation tells that the budget is close. Every call prints one `perf:` line, which is where the
 * numbers for `docs/specs/performance-budgets.md` come from.
 */
export function expectWithinBudget(name: string, medianMs: number, budgetMs: number): void {
  const share = medianMs / budgetMs;
  console.log(`perf: ${name}: ${format(medianMs)} ms (budget ${budgetMs} ms)`);
  if (share > 1) {
    throw new Error(
      `${name} took ${format(medianMs)} ms, over its budget of ${budgetMs} ms (${Math.round(share * 100)}%)`,
    );
  }
  if (share > WARN_AT) {
    console.log(
      `::warning title=Performance::${name} took ${format(medianMs)} ms, ${Math.round(share * 100)}% of its ${budgetMs} ms budget`,
    );
  }
}
