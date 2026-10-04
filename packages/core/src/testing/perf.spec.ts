import { WARN_AT, expectWithinBudget, measure, measureAsync } from './perf';

describe('measure', () => {
  it('runs the warmup and the timed runs, and returns the median', () => {
    const fn = vi.fn();
    // performance.now is read twice per timed run (start, then end); the warmup is not timed.
    const now = vi.spyOn(performance, 'now');
    for (const t of [10, 11, 20, 25, 30, 33, 40, 140, 50, 52]) now.mockReturnValueOnce(t);
    // Five timed runs took 1, 5, 3, 100 and 2 ms: the median is 3, not the mean (22.2).
    expect(measure(fn, { runs: 5, warmup: 2 })).toBe(3);
    expect(fn).toHaveBeenCalledTimes(7);
    now.mockRestore();
  });

  it('takes the middle of the two in the middle for an even number of runs', () => {
    const now = vi.spyOn(performance, 'now');
    for (const t of [0, 2, 10, 14]) now.mockReturnValueOnce(t);
    expect(measure(() => undefined, { runs: 2, warmup: 0 })).toBe(3);
    now.mockRestore();
  });

  it('measures real work', () => {
    const median = measure(() => {
      const end = performance.now() + 5;
      while (performance.now() < end);
    });
    expect(median).toBeGreaterThanOrEqual(5);
    expect(median).toBeLessThan(100);
  });
});

describe('measureAsync', () => {
  it('waits for the work of every run', async () => {
    let finished = 0;
    await measureAsync(
      async () => {
        await Promise.resolve();
        finished++;
      },
      { runs: 3, warmup: 1 },
    );
    expect(finished).toBe(4);
  });
});

describe('expectWithinBudget', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  beforeEach(() => log.mockClear());
  afterAll(() => log.mockRestore());

  it('passes quietly, but says the number, well within the budget', () => {
    expectWithinBudget('parse (50 states)', 10, 100);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'perf: parse (50 states): 10 ms (budget 100 ms)',
    ]);
  });

  it('passes with a GitHub warning above 70% of the budget', () => {
    expect(WARN_AT).toBe(0.7);
    expectWithinBudget('layout (150 states)', 720, 1000);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      'perf: layout (150 states): 720 ms (budget 1000 ms)',
      '::warning title=Performance::layout (150 states) took 720 ms, 72% of its 1000 ms budget',
    ]);
  });

  it('does not warn at exactly 70%, and passes at exactly the budget', () => {
    expectWithinBudget('a', 70, 100);
    expect(log).toHaveBeenCalledTimes(1);
    expect(() => expectWithinBudget('b', 100, 100)).not.toThrow();
  });

  it('counts in another unit when told to', () => {
    expectWithinBudget('ticks (open)', 3, 5, 'ticks');
    expect(log.mock.calls.map(([line]) => line)).toEqual(
      [
        'perf: ticks (open): 3.0 ticks (budget 5 ticks)',
        '::warning title=Performance::ticks (open) took 3.0 ticks, 60% of its 5 ticks budget',
      ].slice(0, 1),
    );
    expect(() => expectWithinBudget('ticks (open)', 6, 5, 'ticks')).toThrow(
      'ticks (open) took 6.0 ticks, over its budget of 5 ticks (120%)',
    );
  });

  it('fails over the budget, saying by how much', () => {
    expect(() => expectWithinBudget('svg (300 states)', 1500, 1000)).toThrow(
      'svg (300 states) took 1500 ms, over its budget of 1000 ms (150%)',
    );
  });
});
