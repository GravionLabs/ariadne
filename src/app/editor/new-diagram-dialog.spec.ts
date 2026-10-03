import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { askNewDiagram } from './new-diagram-dialog';

describe('askNewDiagram', () => {
  let dialog: Dialog;

  const q = <T extends HTMLElement>(selector: string) =>
    document.querySelector<T>(`.cdk-overlay-container ${selector}`)!;
  const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event('input'));
  };
  const open = async () => {
    const result = askNewDiagram(dialog);
    TestBed.tick();
    await Promise.resolve();
    return result;
  };

  beforeEach(() => {
    dialog = TestBed.inject(Dialog);
  });

  afterEach(() => {
    dialog.closeAll();
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  it('returns the name and description', async () => {
    const result = open();
    await Promise.resolve();
    type(q<HTMLInputElement>('input'), '  Order Saga ');
    type(q<HTMLTextAreaElement>('textarea'), ' Takes an order. ');
    TestBed.tick();
    q<HTMLButtonElement>('button[type=submit]').click();
    expect(await result).toEqual({ name: 'Order Saga', description: 'Takes an order.' });
  });

  it('leaves the description out when it is empty', async () => {
    const result = open();
    await Promise.resolve();
    type(q<HTMLInputElement>('input'), 'Order Saga');
    TestBed.tick();
    q<HTMLButtonElement>('button[type=submit]').click();
    expect(await result).toEqual({ name: 'Order Saga' });
  });

  it('needs a name', async () => {
    const result = open();
    await Promise.resolve();
    TestBed.tick();
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(true);
    type(q<HTMLInputElement>('input'), '   ');
    TestBed.tick();
    expect(q<HTMLButtonElement>('button[type=submit]').disabled).toBe(true);
    q<HTMLButtonElement>('button[type=button]').click();
    expect(await result).toBeUndefined();
  });
});
