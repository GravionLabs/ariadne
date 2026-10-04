import { serializeDiagram } from '@ariadne/core';
import { expectWithinBudget, largeSaga, measure } from '@ariadne/core/testing';
import { checkDiagramText } from './yaml-diagnostics';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<number, number> = { 50: 90, 150: 210, 300: 380 };

describe.each([50, 150, 300])('a saga of %i states', (states) => {
  const text = serializeDiagram(largeSaga(states));

  it('is checked for the Problems panel within its budget', () => {
    expect(checkDiagramText(text).filter((p) => p.severity === 'error')).toEqual([]);
    expectWithinBudget(
      `checkDiagramText (${states} states)`,
      measure(() => checkDiagramText(text)),
      BUDGETS[states],
    );
  });
});
