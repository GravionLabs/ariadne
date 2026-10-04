import { expectWithinBudget, largeSaga, measureAsync } from '@ariadne/core/testing';
import { renderDiagramSvg } from '@ariadne/export';
import { toPng } from './cli';
import { testFonts } from './test-fonts';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<number, number> = { 50: 3500, 150: 3500, 300: 6000 };

describe.each([50, 150, 300])('a saga of %i states', (states) => {
  // The SVG is made once: this measures what `ariadne export --format png` adds to it.
  const image = renderDiagramSvg(largeSaga(states));

  it('turns into a PNG within its budget', async () => {
    expect(Buffer.from((await toPng(image, testFonts())).subarray(0, 4)).toString('latin1')).toBe(
      '\x89PNG',
    );
    // Rendering is slow and steady: three runs tell enough.
    const median = await measureAsync(() => toPng(image, testFonts()), { runs: 3, warmup: 0 });
    expectWithinBudget(`SVG to PNG (${states} states)`, median, BUDGETS[states]);
  });
});
