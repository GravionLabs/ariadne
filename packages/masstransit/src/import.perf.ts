import { expectWithinBudget, largeSaga, measure } from '@ariadne/core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateSaga } from './generate';
import { importSagas } from './import';
import { createNodeParser } from './node';
import { CSharpParser } from './parser';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<number, number> = { 50: 60, 150: 170, 300: 300 };

let parser: CSharpParser;
beforeAll(async () => {
  // Loading the WebAssembly parser is not what is measured.
  parser = await createNodeParser();
});

describe.each([50, 150, 300])('the C# of a saga of %i states', (states) => {
  const files = generateSaga(largeSaga(states)).files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  it('is imported within its budget', () => {
    expect(importSagas(files, parser).sagas).toHaveLength(1);
    expectWithinBudget(
      `importSagas (${states} states)`,
      measure(() => importSagas(files, parser)),
      BUDGETS[states],
    );
  });
});
