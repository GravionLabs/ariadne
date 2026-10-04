import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Diagram } from '@ariadne/core';
import { expectWithinBudget, largeSaga, measureAsync } from '@ariadne/core/testing';
import { CODE_EDITOR_FACTORY } from './code-editor';
import { CSHARP_IMPORTER } from '../import/csharp-parser';
import { DiagramStore } from '../model/diagram-store';
import { FileStorage } from '../storage/file-storage';
import { Editor } from './editor';
import { EditorStore } from './editor-store';
import './native-dialog.testing';

// jsdom has no ResizeObserver; f-flow uses it to track node sizes.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

/** A benchmark runs the operation many times; the default test timeout is 5 s. */
const LONG = 300_000;

/** Budgets by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS = {
  /** Milliseconds. */
  open: { 150: 1000, 300: 4250 } as Record<number, number>,
  select: { 150: 500, 300: 3600 } as Record<number, number>,
  edit: { 150: 1000, 300: 3000 } as Record<number, number>,
  /** `ApplicationRef.tick` calls for the whole operation. */
  openTicks: { 150: 3, 300: 3 } as Record<number, number>,
  selectTicks: { 150: 3, 300: 3 } as Record<number, number>,
  editTicks: { 150: 3, 300: 3 } as Record<number, number>,
};

/** The editor, opened on a diagram, as the unit tests build it (only what a benchmark needs). */
async function openEditor(diagram: Diagram) {
  await TestBed.configureTestingModule({
    imports: [Editor],
    providers: [
      {
        provide: FileStorage,
        useValue: {
          open: async () => null,
          save: async () => null,
          saveAs: async () => null,
          openFiles: async () => null,
          saveFiles: async () => true,
        },
      },
      { provide: CODE_EDITOR_FACTORY, useValue: () => Promise.reject(new Error('not opened')) },
      { provide: CSHARP_IMPORTER, useValue: () => Promise.reject(new Error('not used')) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Editor);
  const store = TestBed.inject(DiagramStore);
  // The scheduler of a zoneless app calls `_tick`, which `tick()` itself calls too. Private, so the
  // tests below insist that something is counted: a change of Angular must not make it silently 0.
  const ticks = vi.spyOn(TestBed.inject(ApplicationRef) as unknown as { _tick(): void }, '_tick');
  store.load(diagram);
  await fixture.whenStable();
  return { fixture, store, ui: fixture.debugElement.injector.get(EditorStore), ticks };
}

const cards = (fixture: { nativeElement: unknown }) =>
  (fixture.nativeElement as HTMLElement).querySelectorAll('app-node-card').length;

describe.each([150, 300])('the editor with a saga of %i states', (states) => {
  const saga = largeSaga(states);

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('opens within its budget, with every node drawn', { timeout: LONG }, async () => {
    let drawn = 0;
    let ticks = 0;
    const median = await measureAsync(
      async () => {
        TestBed.resetTestingModule();
        const opened = await openEditor(saga);
        drawn = cards(opened.fixture);
        ticks = opened.ticks.mock.calls.length;
      },
      { runs: 5, warmup: 1 },
    );
    expect(drawn).toBe(saga.nodes.length);
    expect(ticks).toBeGreaterThan(0);
    expectWithinBudget(`editor open (${states} states)`, median, BUDGETS.open[states]);
    expectWithinBudget(
      `editor open (${states} states), change detection`,
      ticks,
      BUDGETS.openTicks[states],
      'ticks',
    );
  });

  it('selects a state within its budget', { timeout: LONG }, async () => {
    const { fixture, ui, ticks } = await openEditor(saga);
    let n = 0;
    ticks.mockClear();
    const median = await measureAsync(async () => {
      ui.selectNode(`state-${(n++ % (states - 1)) + 1}`);
      await fixture.whenStable();
    });
    expect(ui.selectedNode()).toBeTruthy();
    expect(ticks.mock.calls.length).toBeGreaterThan(0);
    expectWithinBudget(`editor select (${states} states)`, median, BUDGETS.select[states]);
    expectWithinBudget(
      `editor select (${states} states), change detection per selection`,
      Math.ceil(ticks.mock.calls.length / n),
      BUDGETS.selectTicks[states],
      'ticks',
    );
  });

  it(
    'edits a state, which lays the diagram out again, within its budget',
    { timeout: LONG },
    async () => {
      const { fixture, store, ticks } = await openEditor(saga);
      let n = 0;
      ticks.mockClear();
      const median = await measureAsync(async () => {
        store.updateNode('state-75', { name: `Renamed ${n++}` });
        await fixture.whenStable();
      });
      expect(store.nodes().find((x) => x.id === 'state-75')?.name).toBe(`Renamed ${n - 1}`);
      expect(ticks.mock.calls.length).toBeGreaterThan(0);
      expectWithinBudget(`editor edit (${states} states)`, median, BUDGETS.edit[states]);
      expectWithinBudget(
        `editor edit (${states} states), change detection per edit`,
        Math.ceil(ticks.mock.calls.length / n),
        BUDGETS.editTicks[states],
        'ticks',
      );
    },
  );
});
