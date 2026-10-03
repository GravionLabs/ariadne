import { TestBed } from '@angular/core/testing';
import { DiagramExport } from '../export/diagram-export';
import { ExportMenu } from './export-menu';

describe('ExportMenu', () => {
  const exporter = {
    exportSvg: vi.fn(),
    exportPng: vi.fn(),
    exportMermaid: vi.fn(),
    copyMermaid: vi.fn(),
  };

  function setup() {
    TestBed.configureTestingModule({ providers: [{ provide: DiagramExport, useValue: exporter }] });
    const fixture = TestBed.createComponent(ExportMenu);
    fixture.detectChanges();
    const trigger = () => fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
    const open = () => {
      trigger().click();
      fixture.detectChanges();
    };
    return { fixture, trigger, items, open };
  }

  afterEach(() => {
    vi.clearAllMocks();
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  it('is closed until the trigger is clicked', () => {
    const { trigger, items, open } = setup();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(items()).toHaveLength(0);
    open();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('offers SVG and PNG, then Mermaid with the copy entry first', () => {
    const { items, open } = setup();
    open();
    expect(items().map((i) => i.querySelector('strong')?.textContent)).toEqual([
      'SVG',
      'PNG',
      'Copy Mermaid',
      'Mermaid',
      'Mermaid in Markdown',
    ]);
  });

  it.each([
    [0, () => exporter.exportSvg, []],
    [1, () => exporter.exportPng, []],
    [2, () => exporter.copyMermaid, []],
    [3, () => exporter.exportMermaid, ['mmd']],
    [4, () => exporter.exportMermaid, ['md']],
  ])('runs entry %i and closes the menu', (index, method, args) => {
    const { fixture, trigger, items, open } = setup();
    open();
    items()[index].click();
    fixture.detectChanges();
    expect(method()).toHaveBeenCalledWith(...args);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape without exporting', () => {
    const { fixture, trigger, items, open } = setup();
    open();
    items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(exporter.exportSvg).not.toHaveBeenCalled();
  });

  it('moves focus through the entries with the arrow keys, wrapping around', () => {
    const { items, open } = setup();
    open();
    const list = items();
    list[0].focus();
    const press = (key: string) =>
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    press('ArrowDown');
    expect(document.activeElement).toBe(list[1]);
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(list[list.length - 1]);
  });
});
