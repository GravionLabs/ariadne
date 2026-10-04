import { expectWithinBudget, largeSaga, measureAsync } from '@ariadne/core/testing';
import { renderDiagramSvg } from '@ariadne/export';
import { toPng } from './cli';

/**
 * Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. These are
 * targets, not 3× of what is measured: a PNG of a 150-state saga should not take a minute.
 */
const BUDGETS: Record<number, number> = { 50: 5_000, 150: 15_000, 300: 40_000 };

describe.each([50, 150, 300])('a saga of %i states', (states) => {
  // The SVG is made once: this measures what `ariadne export --format png` adds to it.
  const { svg } = renderDiagramSvg(largeSaga(states));

  it('turns into a PNG within its budget', async () => {
    expect(Buffer.from((await toPng(svg)).subarray(0, 4)).toString('latin1')).toBe('\x89PNG');
    // Rendering is slow and steady: three runs tell enough.
    const median = await measureAsync(() => toPng(svg), { runs: 3, warmup: 0 });
    expectWithinBudget(`SVG to PNG (${states} states)`, median, BUDGETS[states]);
  });
});
