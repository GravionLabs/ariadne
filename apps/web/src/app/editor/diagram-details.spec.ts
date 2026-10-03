import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDetails } from './diagram-details';

describe('DiagramDetails', () => {
  let store: DiagramStore;
  let host: HTMLElement;

  const name = () => host.querySelector<HTMLInputElement>('input.name')!;
  const description = () => host.querySelector<HTMLTextAreaElement>('textarea');
  const toggle = () => host.querySelector<HTMLButtonElement>('button.toggle')!;
  const refresh = () => TestBed.tick();

  beforeEach(() => {
    store = TestBed.inject(DiagramStore);
    const fixture = TestBed.createComponent(DiagramDetails);
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('shows the name, and the description only when expanded', () => {
    store.setDetails({ name: 'Order Saga', description: 'About it' });
    refresh();
    expect(name().value).toBe('Order Saga');
    expect(description()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    toggle().click();
    refresh();
    expect(description()!.value).toBe('About it');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');

    toggle().click();
    refresh();
    expect(description()).toBeNull();
  });

  it('marks the collapsed card when there is a description', () => {
    expect(toggle().classList.contains('filled')).toBe(false);
    store.setDetails({ description: 'About it' });
    refresh();
    expect(toggle().classList.contains('filled')).toBe(true);
  });

  it('edits the name and description, one undo step each', () => {
    name().value = 'Order Saga';
    name().dispatchEvent(new Event('change'));
    toggle().click();
    refresh();
    description()!.value = 'Takes an order to done.';
    description()!.dispatchEvent(new Event('change'));

    expect(store.diagram()).toMatchObject({
      name: 'Order Saga',
      description: 'Takes an order to done.',
    });
    store.undo();
    expect(store.diagram().description).toBeUndefined();
    expect(store.diagram().name).toBe('Order Saga');
  });

  describe('code', () => {
    const toggle = () => host.querySelector<HTMLButtonElement>('button.code-toggle')!;
    const fields = () => [...host.querySelectorAll<HTMLInputElement>('.code input')];

    beforeEach(() => {
      // The code sits under the description: open the card first.
      host.querySelector<HTMLButtonElement>('button.toggle')!.click();
      refresh();
      toggle().click();
      refresh();
    });

    it('is folded away until opened, and lists the five fields', () => {
      expect(fields().map((f) => f.getAttribute('aria-label'))).toEqual([
        'State machine class',
        'Namespace',
        'Saga instance type',
        'Current state property',
        'Contracts namespace',
      ]);
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      toggle().click();
      refresh();
      expect(fields()).toHaveLength(0);
    });

    it('edits the saga’s code metadata, one undo step each, and counts what is set', () => {
      const set = (i: number, value: string) => {
        fields()[i].value = value;
        fields()[i].dispatchEvent(new Event('change'));
        refresh();
      };
      set(0, 'OrderStateMachine');
      set(1, 'Shop.Orders');
      expect(store.diagram().saga).toEqual({
        className: 'OrderStateMachine',
        namespace: 'Shop.Orders',
      });
      expect(toggle().querySelector('.count')?.textContent?.trim()).toBe('2');
      store.undo();
      expect(store.diagram().saga).toEqual({ className: 'OrderStateMachine' });
      set(0, '');
      expect(store.diagram().saga).toBeUndefined();
      expect(toggle().querySelector('.count')).toBeNull();
    });

    it('shows what the diagram has', () => {
      store.setSaga({ instanceType: 'OrderState' });
      refresh();
      expect(fields()[2].value).toBe('OrderState');
    });
  });
});
