import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramStore } from '../model/diagram-store';
import orderSaga from '../../../../../docs/examples/order.saga.yaml';
import { PathStore } from './path-store';
import { parseDiagram } from '@ariadne/core';

describe('PathStore', () => {
  let path: PathStore;
  let diagram: DiagramStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PathStore] });
    diagram = TestBed.inject(DiagramStore);
    path = TestBed.inject(PathStore);
    diagram.load(parseDiagram(orderSaga));
  });

  it('shows nothing until it is opened and has text', () => {
    path.setText('- OrderReceived');
    expect(path.result()).toBeNull();
    path.start();
    expect(path.result()?.current).toBe('state-1');
    path.setText('');
    expect(path.result()).toBeNull();
    expect(path.error()).toBeNull();
  });

  it('resolves the pasted steps against the diagram', () => {
    path.start();
    path.setText(
      '- OrderReceived\n- StockReserved\n- { event: PaymentFailed, to: Cancelled, note: declined }',
    );
    expect(path.error()).toBeNull();
    expect(path.steps()).toHaveLength(3);
    const result = path.result()!;
    expect(result.problems).toEqual([]);
    expect(path.nodeIds()).toEqual(['start-1', 'state-1', 'state-2', 'end-2']);
  });

  it('tells what to emphasise and what to write on it: a loop reads 2, 3', () => {
    path.start();
    path.setText('[OrderReceived, StockReserved, {event: PaymentFailed, to: Charging payment}]');
    const result = path.result()!;
    expect(result.problems).toEqual([]);
    expect(path.edgeIds()).toContain('edge-7');
    expect(path.badges().get('state-2')).toBe('×2');
    expect(path.badges().get('edge-7')).toBe('3');
    expect(path.badges().get('edge-1')).toBe('1');
    expect(path.badges().has('end-1')).toBe(false);
  });

  it('reports text that is not a path, and unresolvable steps', () => {
    path.start();
    path.setText('event: X');
    expect(path.error()).toContain('list of steps');
    expect(path.result()).toBeNull();
    path.setText('- OrderReceived\n- Nonsense');
    expect(path.error()).toBeNull();
    expect(path.result()?.problems).toHaveLength(1);
    expect(path.nodeIds()).toEqual(['start-1', 'state-1']);
  });

  it('follows the diagram when it changes, and keeps the text when closed', () => {
    path.start();
    path.setText('- OrderReceived');
    expect(path.result()?.problems).toEqual([]);
    diagram.remove({ edgeIds: ['edge-1'] });
    expect(path.result()?.problems).toHaveLength(1);
    path.stop();
    expect(path.result()).toBeNull();
    expect(path.text()).toBe('- OrderReceived');
  });
});
