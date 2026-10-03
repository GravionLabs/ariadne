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

  it('offers the samples, and returns the one that is picked', async () => {
    const promise = open();
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.sample')];
    expect(buttons.map((b) => b.querySelector('.title')?.textContent)).toEqual([
      'Order saga',
      'Booking saga',
      'Travel booking',
    ]);
    buttons[2].click();
    const result = await promise;
    expect(result?.sample?.id).toBe('travel-booking');
    expect(sampleDiagram(result!.sample!).nodes.length).toBeGreaterThan(5);
  });
});
