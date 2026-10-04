import { expectWithinBudget, largeSaga, measure } from '@ariadne/core/testing';
import { diagramToMarkdown } from './markdown';
import { diagramToMermaid } from './mermaid';
import { renderDiagramSvg } from './svg';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<string, Record<number, number>> = {
  renderDiagramSvg: { 50: 150, 150: 400, 300: 2150 },
  diagramToMermaid: { 50: 50, 150: 50, 300: 50 },
  diagramToMarkdown: { 50: 50, 150: 50, 300: 50 },
};

describe.each([50, 150, 300])('a saga of %i states', (states) => {
  const saga = largeSaga(states);

  const operations: [string, () => unknown][] = [
    // Includes the layout.
    ['renderDiagramSvg', () => renderDiagramSvg(saga)],
    ['diagramToMermaid', () => diagramToMermaid(saga)],
    ['diagramToMarkdown', () => diagramToMarkdown(saga)],
  ];

  it.each(operations)('%s is within its budget', (name, run) => {
    expectWithinBudget(`${name} (${states} states)`, measure(run), BUDGETS[name][states]);
  });
});
