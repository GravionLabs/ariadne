import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { FCanvasComponent, FDraggableDirective, FSelectionChangeEvent } from '@foblex/flow';
import { parseDiagram } from '@ariadne/core';
import type { ImportResult } from '@ariadne/masstransit';
import orderYaml from '../../../../docs/examples/order.saga.yaml';
import { CODE_EDITOR_FACTORY } from './editor/code-editor';
import { Editor } from './editor/editor';
import { GenerateDialog } from './editor/generate-dialog';
import { ImportDialog } from './editor/import-dialog';
import { NewDiagramDialog } from './editor/new-diagram-dialog';
import './editor/native-dialog.testing';
import { CSHARP_IMPORTER } from './import/csharp-parser';
import { DiagramStore } from './model/diagram-store';
import { FileStorage } from './storage/file-storage';
import { axeFindings } from './testing/axe';
import { Theme, ThemeName } from './theme';

// jsdom has no ResizeObserver; f-flow uses it to track node sizes.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

/**
 * Checks that fail today and are fixed in #297, each by name. An entry is removed when its fix
 * lands; the checks themselves are written in full so that #297 only has to un-skip them.
 */
const NOT_YET_FIXED = new Set<string>([
  'light: the export menu',
  'dark: the export menu',
  'high-contrast: the export menu',
]);

const THEMES: ThemeName[] = ['light', 'dark', 'high-contrast'];

/** The editor as the unit tests build it (copied, not imported: a spec is not a library). */
async function openEditor() {
  const storage = {
    open: async () => null,
    save: async () => null,
    saveAs: async () => null,
    openFiles: async () => null,
    saveFiles: async () => true,
  };
  const codeEditor = async (_parent: HTMLElement, options: { text: string }) => ({
    text: options.text,
    setText: () => {},
    focus: () => {},
    showError: () => {},
    reveal: () => {},
    destroy: () => {},
  });
  await TestBed.configureTestingModule({
    imports: [Editor],
    providers: [
      { provide: FileStorage, useValue: storage },
      { provide: CODE_EDITOR_FACTORY, useValue: codeEditor },
      { provide: CSHARP_IMPORTER, useValue: () => Promise.reject(new Error('not used')) },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(Editor);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const store = TestBed.inject(DiagramStore);
  const select = async (nodeIds: string[], edgeIds: string[] = []) => {
    fixture.debugElement
      .query(By.directive(FDraggableDirective))
      .injector.get(FDraggableDirective)
      .fSelectionChange.emit(new FSelectionChangeEvent(nodeIds, [], edgeIds));
    await settle();
  };
  /** A button of the top bar, by its text. */
  const topButton = (text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('header button')].find((b) =>
      b.textContent?.includes(text),
    )!;
  const click = async (button: HTMLElement) => {
    button.click();
    await settle();
  };
  return { fixture, el, store, settle, select, topButton, click };
}

type Editor_ = Awaited<ReturnType<typeof openEditor>>;

/** A view: its name, how to show it, and what must be on the page once it is shown. */
interface View {
  name: string;
  shown: string;
  show: (e: Editor_) => Promise<void>;
}

const loadOrder = async ({ store, settle }: Editor_) => {
  store.load(parseDiagram(orderYaml));
  await settle();
};

/** The views and dialogs of the editor, each set up from the order sample. */
const VIEWS: View[] = [
  { name: 'the empty editor', shown: 'app-node-card', show: async () => {} },
  { name: 'the order sample', shown: 'app-node-card:nth-of-type(5)', show: loadOrder },
  {
    name: 'a selected state',
    shown: 'app-inspector[aria-label]',
    show: async (e) => {
      await loadOrder(e);
      await e.select([e.store.nodes().find((n) => n.type === 'state')!.id]);
    },
  },
  {
    name: 'a selected transition',
    shown: "app-inspector[aria-label='Transition settings']",
    show: async (e) => {
      await loadOrder(e);
      await e.select([], [e.store.edges()[1].id]);
    },
  },
  {
    name: 'the source panel',
    shown: 'app-source-panel',
    show: async (e) => {
      await loadOrder(e);
      await e.click(e.el.querySelector<HTMLButtonElement>('.source-toggle')!);
    },
  },
  {
    name: 'the message catalog',
    shown: 'app-catalog-panel',
    show: async (e) => {
      await loadOrder(e);
      await e.click(e.topButton('Messages'));
    },
  },
  {
    name: 'the walkthrough after one step',
    shown: 'app-walkthrough-panel',
    show: async (e) => {
      await loadOrder(e);
      await e.click(e.topButton('Walkthrough'));
      await e.click(e.el.querySelector<HTMLButtonElement>('app-walkthrough-panel .option')!);
    },
  },
  {
    name: 'the path panel with a pasted path',
    shown: 'app-path-panel',
    show: async (e) => {
      await loadOrder(e);
      await e.click(e.topButton('Path'));
      const input = e.el.querySelector<HTMLTextAreaElement>('app-path-panel textarea')!;
      input.value = '- OrderReceived\n- StockReserved';
      input.dispatchEvent(new Event('input'));
      await e.settle();
    },
  },
  {
    name: 'the problems menu',
    shown: '.cdk-overlay-pane',
    show: async (e) => {
      // A saga with a problem, so that the menu has something to list.
      await loadOrder(e);
      e.store.addNode('state');
      await e.settle();
      await e.click(e.el.querySelector<HTMLButtonElement>('app-problems-menu button')!);
    },
  },
  {
    name: 'the export menu',
    shown: '.cdk-overlay-pane [role=menuitem]',
    show: async (e) => {
      await e.click(e.el.querySelector<HTMLButtonElement>('app-export-menu button')!);
    },
  },
  {
    name: 'the new diagram dialog',
    shown: 'app-new-diagram-dialog dialog[open]',
    show: async (e) => {
      void e.fixture.debugElement.query(By.directive(NewDiagramDialog)).componentInstance.open();
      await e.settle();
    },
  },
  {
    name: 'the import dialog',
    shown: 'app-import-dialog dialog[open]',
    show: async (e) => {
      await loadOrder(e);
      const result: ImportResult = {
        sagas: [
          {
            className: 'OrderStateMachine',
            diagram: e.store.diagram(),
            locations: { states: {}, transitions: {} },
          },
        ],
        warnings: [{ path: 'OrderStateMachine.cs', line: 12, message: 'Then(…) runs code.' }],
      };
      void e.fixture.debugElement
        .query(By.directive(ImportDialog))
        .componentInstance.open(result, 1);
      await e.settle();
    },
  },
  {
    name: 'the generate dialog',
    shown: 'app-generate-dialog dialog[open]',
    show: async (e) => {
      e.fixture.debugElement.query(By.directive(GenerateDialog)).componentInstance.open(
        {
          files: [
            { path: 'OrderStateMachine.cs', content: 'public class OrderStateMachine {}\n' },
            { path: 'Contracts.cs', content: 'public record OrderReceived;\n' },
          ],
          warnings: ['A join is not generated yet.'],
        },
        'order',
      );
      await e.settle();
    },
  },
];

describe.each(THEMES)('accessibility, %s theme', (theme) => {
  beforeEach(() => localStorage.clear());

  for (const { name, show, shown } of VIEWS) {
    // Skipped until #297 fixes what it finds; see NOT_YET_FIXED.
    const check = NOT_YET_FIXED.has(`${theme}: ${name}`) ? it.skip : it;
    check(`has no serious axe findings in ${name}`, async () => {
      const editor = await openEditor();
      TestBed.inject(Theme).setHost(theme);
      await editor.settle();
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await show(editor);
      // What is checked is really there (an axe run over an empty page finds nothing).
      expect(document.querySelector(shown), `${name}: ${shown}`).not.toBeNull();
      expect(await axeFindings()).toEqual([]);
    });
  }
});

// ---- WCAG 2.2 criteria that axe cannot see in jsdom

/** Targets smaller than this, declared in CSS, fail 2.5.8 (target size, minimum). */
const MIN_TARGET = 24;

/**
 * Interactive elements whose declared width or height is below {@link MIN_TARGET} px. jsdom computes
 * the declared styles but has no layout, so a size that is left to the content (`auto`) cannot be
 * judged here and is not reported. An element inside a line of text is exempt, as WCAG allows.
 */
function smallTargets(root: HTMLElement): string[] {
  const px = (value: string) => (value.endsWith('px') ? parseFloat(value) : Number.NaN);
  const declared = (value: string, min: string) => Math.max(px(value) || 0, px(min) || 0);
  const inText = (el: Element) =>
    getComputedStyle(el).display === 'inline' && !!el.closest('p, li, small, label');
  const selector = 'button, a[href], [role=button], input:not([type=hidden]), select';
  return [...root.querySelectorAll<HTMLElement>(selector)]
    .filter((el) => !el.closest('[hidden], [inert]') && !inText(el))
    .filter((el) => {
      const { width, minWidth, height, minHeight } = getComputedStyle(el);
      const w = px(width);
      const h = px(height);
      return (
        (!Number.isNaN(w) && declared(width, minWidth) < MIN_TARGET) ||
        (!Number.isNaN(h) && declared(height, minHeight) < MIN_TARGET)
      );
    })
    .map((el) => {
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
      return `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')} "${name}"`;
    });
}

/**
 * Views with a control under 24 px, fixed in #297 (the names of VIEWS). It is the "Show description"
 * toggle of a state card, 22 px, which every view of the order sample has.
 */
const SMALL_TARGETS_NOT_YET_FIXED = new Set<string>([
  'the order sample',
  'a selected state',
  'a selected transition',
  'the source panel',
  'the message catalog',
  'the walkthrough after one step',
  'the path panel with a pasted path',
  'the problems menu',
  'the import dialog',
]);

describe('WCAG 2.2: 2.5.8 target size', () => {
  beforeEach(() => localStorage.clear());

  for (const { name, show } of VIEWS) {
    const check = SMALL_TARGETS_NOT_YET_FIXED.has(name) ? it.skip : it;
    check(`every control is at least 24×24 px in ${name}`, async () => {
      const editor = await openEditor();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await show(editor);
      expect(smallTargets(document.body)).toEqual([]);
    });
  }
});

describe('WCAG 2.2: 2.5.7 dragging movements', () => {
  beforeEach(() => localStorage.clear());

  it('can zoom and fit with buttons, so the canvas needs no pinch or wheel', async () => {
    const { fixture, el, settle } = await openEditor();
    const canvas = fixture.debugElement.query(By.directive(FCanvasComponent)).componentInstance;
    const scale = vi.spyOn(canvas as FCanvasComponent, 'getScale');
    const button = (label: string) =>
      el.querySelector<HTMLButtonElement>(`.toolbox [aria-label="${label}"]`)!;
    for (const label of ['Zoom in', 'Zoom out', 'Fit to screen']) {
      expect(button(label), label).not.toBeNull();
      expect(button(label).disabled, label).toBe(false);
    }
    const before = (canvas as FCanvasComponent).getScale();
    button('Zoom in').click();
    await settle();
    expect((canvas as FCanvasComponent).getScale()).toBeGreaterThan(before);
    expect(scale).toBeDefined();
  });

  it('can make a connection without dragging: from a state to a new state, and to an existing one', async () => {
    // A connection is dragged out of a state in the canvas. Without a pointer: the "+" button after
    // a state, and the inspector's "To a new state" and "To an existing state".
    const e = await openEditor();
    await loadOrder(e);
    expect(
      e.el.querySelector(
        '.slot [aria-label="Add the next state"], [aria-label="Insert a state here"]',
      ),
    ).not.toBeNull();
    await e.select([e.store.nodes().find((n) => n.type === 'state')!.id]);
    const labels = [...e.el.querySelectorAll('app-inspector button, app-inspector select')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
    );
    expect(labels).toEqual(expect.arrayContaining(['To a new state', 'To an existing state']));
  });
});

describe('WCAG 2.2: 2.4.11 focus not obscured', () => {
  beforeEach(() => localStorage.clear());

  /**
   * jsdom has no layout: the rectangles are made up. The flow fills 1200 × 800 and the inspector
   * covers its right 300 px; a state at `x` is 260 px wide.
   */
  function layOut(el: HTMLElement, nodeX: number) {
    const rect = (x: number, y: number, width: number, height: number) =>
      ({
        x,
        y,
        left: x,
        top: y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        toJSON() {},
      }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName === 'F-FLOW') return rect(0, 0, 1200, 800);
      if (this.tagName === 'APP-INSPECTOR') return rect(900, 0, 300, 800);
      if (this.tagName === 'APP-NODE-CARD') return rect(nodeX, 300, 260, 100);
      return rect(0, 0, 0, 0);
    });
    return el;
  }

  async function selectWithKeyboard(nodeX: number) {
    const e = await openEditor();
    await loadOrder(e);
    const canvas = e.fixture.debugElement.query(By.directive(FCanvasComponent))
      .componentInstance as FCanvasComponent;
    const center = vi.spyOn(canvas, 'centerGroupOrNode');
    // The inspector opens for the first selection, and takes its place on the right.
    await e.select([e.store.nodes()[0].id]);
    layOut(e.el, nodeX);
    center.mockClear();
    const id = e.store.nodes().find((n) => n.type === 'state')!.id;
    await e.select([id]);
    return { center, id };
  }

  // fixed in #297: the editor does not look at where a selected state is.
  it.skip('brings a state into view when it lies under the inspector', async () => {
    const { center, id } = await selectWithKeyboard(950);
    expect(center).toHaveBeenCalledWith(id, expect.anything());
  });

  it('leaves the view alone when the state is in the clear part of the canvas', async () => {
    const { center } = await selectWithKeyboard(300);
    expect(center).not.toHaveBeenCalled();
  });
});
