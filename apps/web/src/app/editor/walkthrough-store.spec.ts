import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagramStore } from '../model/diagram-store';
import orderSaga from '../../../../../docs/examples/order.saga.yaml';
import { WalkthroughStore } from './walkthrough-store';
import { parseDiagram } from '@ariadne/core';

describe('WalkthroughStore', () => {
  let walk: WalkthroughStore;
  let diagram: DiagramStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [WalkthroughStore] });
    diagram = TestBed.inject(DiagramStore);
    walk = TestBed.inject(WalkthroughStore);
    diagram.load(parseDiagram(orderSaga));
  });

  it('is idle until started, then in the initial state', () => {
    expect(walk.active()).toBe(false);
    expect(walk.current()).toBeUndefined();
    expect(walk.options()).toEqual([]);
    walk.start();
    expect(walk.active()).toBe(true);
    expect(walk.current()?.name).toBe('Initial');
    expect(walk.options().map((e) => e.event)).toEqual(['OrderReceived']);
    expect(walk.doings()).toEqual([]);
    expect(walk.text()).toBe('Initial');
  });

  it('takes an offered transition and shows what the next state does', () => {
    walk.start();
    expect(walk.take('edge-1')).toBe(true);
    expect(walk.current()?.name).toBe('Reserving stock');
    expect(walk.lastStep()).toBe('edge-1');
    expect(walk.doings()).toEqual(['Send ReserveStock']);
    expect(walk.options().map((e) => e.id)).toEqual(['edge-2', 'edge-3']);
  });

  it('refuses a transition the current state does not offer', () => {
    walk.start();
    expect(walk.take('edge-4')).toBe(false);
    expect(walk.take('nope')).toBe(false);
    expect(walk.steps()).toEqual([]);
  });

  it('goes back a step and restarts', () => {
    walk.start();
    walk.take('edge-1');
    walk.take('edge-2');
    walk.back();
    expect(walk.current()?.name).toBe('Reserving stock');
    walk.take('edge-3');
    expect(walk.current()?.name).toBe('Cancelled');
    expect(walk.options()).toEqual([]);
    walk.restart();
    expect(walk.steps()).toEqual([]);
    expect(walk.current()?.name).toBe('Initial');
    walk.back();
    expect(walk.steps()).toEqual([]);
  });

  it('writes the path as text', () => {
    walk.start();
    walk.take('edge-1');
    expect(walk.text()).toBe('Initial\n1. OrderReceived → Reserving stock\n   Send ReserveStock');
  });

  it('stops: back to idle with an empty path', () => {
    walk.start();
    walk.take('edge-1');
    walk.stop();
    expect(walk.active()).toBe(false);
    expect(walk.steps()).toEqual([]);
    expect(walk.text()).toBe('');
  });

  it('notices when the diagram no longer has the path', () => {
    walk.start();
    walk.take('edge-1');
    expect(walk.valid()).toBe(true);
    diagram.remove({ edgeIds: ['edge-1'] });
    expect(walk.valid()).toBe(false);
  });

  it('is valid while idle, whatever the diagram', () => {
    diagram.remove({ edgeIds: ['edge-1'] });
    expect(walk.valid()).toBe(true);
  });
});
