import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import './native-dialog.testing';
import { sampleDiagram } from '../samples';
import { SamplesDialog } from './samples-dialog';

@Component({ imports: [SamplesDialog], template: '<app-samples-dialog />' })
class Host {
  readonly dialog = viewChild.required(SamplesDialog);
}

describe('SamplesDialog', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  const dialog = () => el.querySelector('dialog')!;
  const open = () => {
    const result = fixture.componentInstance.dialog().open();
    fixture.detectChanges();
    return result;
  };
  const headings = () => [...el.querySelectorAll('section.samples h3')].map((h) => h.textContent);

  /** The library is a chunk of its own, loaded when the dialog opens: waits until its group is shown. */
  const libraryLoaded = async () => {
    for (let i = 0; i < 200 && !el.querySelector('#samples-library'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.detectChanges();
    }
    expect(el.querySelector('#samples-library'), 'the library was not loaded').not.toBeNull();
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('is closed until opened, and is named by its heading', () => {
    expect(dialog().hasAttribute('open')).toBe(false);
    open();
    expect(dialog().hasAttribute('open')).toBe(true);
    const title = el.querySelector(`#${dialog().getAttribute('aria-labelledby')}`);
    expect(title?.textContent).toBe('Samples');
  });

  it('shows the tour at once, and the library when it has been loaded', async () => {
    open();
    expect(headings()).toEqual(['Start with a tour']);
    await libraryLoaded();
    expect(headings()).toEqual(['Start with a tour', 'Real-world sagas']);
  });

  it('offers the samples in two groups, each a list with a heading', async () => {
    open();
    await libraryLoaded();
    const groups = [...el.querySelectorAll<HTMLElement>('section.samples')];
    // Each group is named by its heading, so a screen reader announces it when entering it.
    for (const group of groups) {
      const heading = group.querySelector('h3')!;
      expect(group.getAttribute('aria-labelledby')).toBe(heading.id);
    }
    const titles = (group: HTMLElement) =>
      [...group.querySelectorAll('.sample .title')].map((t) => t.textContent);
    expect(titles(groups[0])).toEqual(['Order saga', 'Booking saga', 'Travel booking']);
    expect(titles(groups[1])).toEqual([
      'Order fulfilment',
      'Payment with retries',
      'Customer onboarding',
      'Trip booking',
      'Loan application',
      'Tenant provisioning',
    ]);
  });

  it('shows each sample as a button with its title and its description', async () => {
    open();
    await libraryLoaded();
    for (const button of el.querySelectorAll<HTMLButtonElement>('.sample')) {
      expect(button.type).toBe('button');
      expect(button.querySelector('.title')?.textContent).toMatch(/\S/);
      expect(button.querySelector('.about')?.textContent).toMatch(/\S/);
    }
  });

  it('returns the sample that is picked, from either group, and closes', async () => {
    const tour = open();
    el.querySelectorAll<HTMLButtonElement>('.sample')[2].click();
    const first = await tour;
    expect(first?.id).toBe('travel-booking');
    expect(first?.fileName).toBe('travel-booking.saga.yaml');
    expect(sampleDiagram(first!).nodes.length).toBeGreaterThan(5);
    expect(dialog().hasAttribute('open')).toBe(false);

    const library = open();
    await libraryLoaded();
    [...el.querySelectorAll<HTMLButtonElement>('.sample')]
      .find((b) => b.querySelector('.title')?.textContent === 'Loan application')!
      .click();
    expect(await library).toMatchObject({
      id: 'loan-application',
      group: 'library',
      fileName: 'loan-application.saga.yaml',
    });
  });

  it('resolves to undefined when cancelled or closed with Escape', async () => {
    const cancelled = open();
    [...el.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Cancel')!
      .click();
    expect(await cancelled).toBeUndefined();

    const escaped = open();
    dialog().close();
    expect(await escaped).toBeUndefined();
  });

  it('forgets an earlier pick when opened again', async () => {
    const first = open();
    el.querySelector<HTMLButtonElement>('.sample')!.click();
    await first;
    const second = open();
    dialog().close();
    expect(await second).toBeUndefined();
  });
});
