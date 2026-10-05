import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_MODE } from './demo-mode';
import { DemoNotice } from './demo-notice';
import { axeFindings } from './testing/axe';

describe('DemoNotice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function render(demo: boolean) {
    TestBed.configureTestingModule({
      imports: [DemoNotice],
      providers: [{ provide: DEMO_MODE, useValue: demo }],
    });
    const fixture = TestBed.createComponent(DemoNotice);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }
  const notice = (el: HTMLElement) => el.querySelector('[role="status"]');

  it('is not a demo by default: nothing is shown', () => {
    expect(TestBed.inject(DEMO_MODE)).toBe(false);
    TestBed.resetTestingModule();
    const { el } = render(false);
    expect(notice(el)).toBeNull();
  });

  it('tells a visitor of the demo that the diagrams stay in the browser, and links the guide', () => {
    const { el } = render(true);
    expect(notice(el)?.textContent).toContain(
      'This is a demo. Your diagrams stay in this browser: nothing is uploaded.',
    );
    expect(notice(el)?.textContent).toContain('Save to keep a file on your computer.');
    expect(el.querySelector('a')?.getAttribute('href')).toBe('../guide/');
  });

  it('is dismissed with its button, and stays away on the next visit', () => {
    const first = render(true);
    first.el
      .querySelector<HTMLButtonElement>('button[aria-label="Dismiss the demo notice"]')!
      .click();
    first.fixture.detectChanges();
    expect(notice(first.el)).toBeNull();
    TestBed.resetTestingModule();
    expect(notice(render(true).el)).toBeNull();
  });

  it('works when the browser does not let the page keep anything', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    const { el, fixture } = render(true);
    expect(notice(el)).not.toBeNull();
    el.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    expect(notice(el)).toBeNull();
  });

  it('has nothing for an accessibility check to find', async () => {
    const { el } = render(true);
    document.body.append(el);
    expect(await axeFindings(el)).toEqual([]);
    el.remove();
  });
});
