import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDetails } from './diagram-details';

describe('DiagramDetails', () => {
  let store: DiagramStore;
  let host: HTMLElement;

  const button = () => host.querySelector<HTMLButtonElement>('button')!;
  const field = <T extends HTMLElement>(selector: string) =>
    document.querySelector<T>(`.cdk-overlay-container ${selector}`);

  async function open(): Promise<void> {
    button().click();
    TestBed.tick();
    await Promise.resolve();
  }

  beforeEach(() => {
    store = TestBed.inject(DiagramStore);
    const fixture = TestBed.createComponent(DiagramDetails);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows "Details" until the saga has a name, then the name', () => {
    expect(button().textContent).toContain('Details');
    store.setDetails({ name: 'Order Saga' });
    TestBed.tick();
    expect(button().textContent).toContain('Order Saga');
  });

  it('edits the name and description, one undo step each', async () => {
    await open();
    const name = field<HTMLInputElement>('input')!;
    name.value = 'Order Saga';
    name.dispatchEvent(new Event('change'));
    const description = field<HTMLTextAreaElement>('textarea')!;
    description.value = 'Takes an order to done.';
    description.dispatchEvent(new Event('change'));

    expect(store.diagram()).toMatchObject({
      name: 'Order Saga',
      description: 'Takes an order to done.',
    });
    store.undo();
    expect(store.diagram().description).toBeUndefined();
    expect(store.diagram().name).toBe('Order Saga');
  });

  it('shows the current values when opened', async () => {
    store.setDetails({ name: 'Order Saga', description: 'About it' });
    await open();
    expect(field<HTMLInputElement>('input')!.value).toBe('Order Saga');
    expect(field<HTMLTextAreaElement>('textarea')!.value).toBe('About it');
  });
});
