import { BUDGETS, WARN_AT, evaluate, table } from '../scripts/size-budget.mjs';

const sizes = (gzip: number) => [{ file: 'dist/index.js', raw: gzip * 3, gzip }];
const budgets = { 'dist/index.js': 1000 };

describe('evaluate', () => {
  it('is ok up to 90% of the budget', () => {
    expect(evaluate(sizes(900), budgets)[0]).toMatchObject({ status: 'ok', share: 0.9 });
    expect(WARN_AT).toBe(0.9);
  });

  it('warns above 90% and up to the budget', () => {
    expect(evaluate(sizes(901), budgets)[0]?.status).toBe('warning');
    expect(evaluate(sizes(1000), budgets)[0]?.status).toBe('warning');
  });

  it('is over the budget above it', () => {
    expect(evaluate(sizes(1001), budgets)[0]?.status).toBe('over');
  });

  it('refuses a file that has no budget, so a new file cannot go unchecked', () => {
    expect(() => evaluate([{ file: 'dist/new.js', raw: 1, gzip: 1 }], budgets)).toThrow(
      'No size budget for dist/new.js',
    );
  });

  it('has a budget for each file the package ships as code', () => {
    expect(Object.keys(BUDGETS)).toEqual([
      'dist/ariadne-viewer.js',
      'dist/index.js',
      'dist/angular/index.js',
    ]);
  });
});

describe('table', () => {
  it('shows raw and gzip size, the budget and how much of it is used', () => {
    const cells = (line: string) => line.split(/ {2,}/);
    const lines = table(evaluate(sizes(900), budgets)).split('\n');
    expect(cells(lines[0]!)).toEqual(['file', 'raw', 'gzip', 'budget (gzip)', 'used']);
    expect(cells(lines[1]!)).toEqual(['dist/index.js', '2.7 kB', '0.9 kB', '1.0 kB', '90%', 'ok']);
  });
});
