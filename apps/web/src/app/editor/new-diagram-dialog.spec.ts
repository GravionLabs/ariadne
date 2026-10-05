import { Component, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import './native-dialog.testing';
import { sampleDiagram } from '../samples';
import { NewDiagramDialog } from './new-diagram-dialog';

@Component({ imports: [NewDiagramDialog], template: '<app-new-diagram-dialog />' })
class Host {
  readonly dialog = viewChild.required(NewDiagramDialog);
}

describe('NewDiagramDialog', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  const dialog = () => el.querySelector('dialog')!;
  const field = <T extends HTMLElement>(selector: string) => el.querySelector<T>(selector)!;
  const submit = () => field<HTMLButtonElement>('button[type=submit]');
  const type = (selector: string, value: string) => {
    const input = field<HTMLInputElement | HTMLTextAreaElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const open = () => {
    const result = fixture.componentInstance.dialog().open();
    fixture.detectChanges();
    return result;
  };

  beforeEach(() => {
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('is closed until opened', () => {
    expect(dialog().hasAttribute('open')).toBe(false);
    open();
    expect(dialog().hasAttribute('open')).toBe(true);
  });

  it('returns the name and description', async () => {
    const result = open();
    type('input', '  Order Saga ');
    type('textarea', ' Takes an order. ');
    submit().click();
    expect(await result).toEqual({ name: 'Order Saga', description: 'Takes an order.' });
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('leaves the description out when it is empty', async () => {
    const result = open();
    type('input', 'Order Saga');
    submit().click();
    expect(await result).toEqual({ name: 'Order Saga' });
  });

  it('needs a name', async () => {
    const result = open();
    expect(submit().disabled).toBe(true);
    type('input', '   ');
    expect(submit().disabled).toBe(true);
    field<HTMLButtonElement>('button[type=button]').click();
    expect(await result).toBeUndefined();
  });

  it('resolves to undefined when closed with Escape', async () => {
    const result = open();
    type('input', 'Order Saga');
    dialog().close();
    expect(await result).toBeUndefined();
  });

  it('starts empty each time and forgets a cancelled name', async () => {
    const first = open();
    type('input', 'Old');
    dialog().close();
    await first;
    open();
    expect(field<HTMLInputElement>('input').value).toBe('');
    expect(submit().disabled).toBe(true);
  });

  /** The library is a chunk of its own, loaded when the dialog opens: waits until its group is shown. */
  const libraryLoaded = async () => {
    for (let i = 0; i < 200 && !el.querySelector('#samples-library'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.detectChanges();
    }
    expect(el.querySelector('#samples-library'), 'the library was not loaded').not.toBeNull();
  };

  it('shows the tour at once, and the library when it has been loaded', async () => {
    open();
    expect([...el.querySelectorAll('section.samples h3')].map((h) => h.textContent)).toEqual([
      'Start with a tour',
    ]);
    await libraryLoaded();
    expect([...el.querySelectorAll('section.samples h3')].map((h) => h.textContent)).toEqual([
      'Start with a tour',
      'Real-world sagas',
    ]);
  });

  it('offers the samples in two groups, each a list with a heading', async () => {
    open();
    await libraryLoaded();
    const groups = [...el.querySelectorAll<HTMLElement>('section.samples')];
    expect(groups.map((g) => g.querySelector('h3')?.textContent)).toEqual([
      'Start with a tour',
      'Real-world sagas',
    ]);
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

  it('returns the sample that is picked, from either group', async () => {
    const tour = open();
    el.querySelectorAll<HTMLButtonElement>('.sample')[2].click();
    const first = await tour;
    expect(first?.sample?.id).toBe('travel-booking');
    expect(sampleDiagram(first!.sample!).nodes.length).toBeGreaterThan(5);

    const library = open();
    await libraryLoaded();
    const button = [...el.querySelectorAll<HTMLButtonElement>('.sample')].find(
      (b) => b.querySelector('.title')?.textContent === 'Loan application',
    )!;
    button.click();
    const second = await library;
    expect(second?.name).toBe('Loan application');
    expect(second?.sample).toMatchObject({ id: 'loan-application', group: 'library' });
    expect(sampleDiagram(second!.sample!).nodes.length).toBeGreaterThan(5);
  });
});
