import orderSaga from '../../../docs/examples/order.saga.yaml';
import travelBooking from '../../../docs/examples/travel-booking.saga.yaml';
import { describe, expect, it } from 'vitest';
import { parseDiagram } from './diagram-yaml';
import { doingsOf, follow, optionsAt, startOf, walkAsText } from './walkthrough';

const order = parseDiagram(orderSaga);
const travel = parseDiagram(travelBooking);

describe('startOf', () => {
  it('is the initial state', () => {
    expect(startOf(order)?.name).toBe('Initial');
    expect(startOf({ direction: 'top-bottom', nodes: [], edges: [] })).toBeUndefined();
  });
});

describe('optionsAt', () => {
  it('offers the transitions that leave the state', () => {
    expect(optionsAt(order, 'state-1').map((e) => e.event)).toEqual([
      'StockReserved',
      'StockUnavailable',
    ]);
  });

  it('offers nothing in a final state, and nothing for an unknown state', () => {
    expect(optionsAt(order, 'end-1')).toEqual([]);
    expect(optionsAt(order, 'nope')).toEqual([]);
  });

  it('leaves out compensation transitions', () => {
    const ids = optionsAt(travel, 'state-4').map((e) => e.id);
    expect(ids).not.toContain('edge-23');
    expect(ids).toEqual(expect.arrayContaining(['edge-15', 'edge-16']));
  });

  it('adds what the Any node does in every state, but not in the initial or a final state', () => {
    const inState = optionsAt(travel, 'state-2').map((e) => e.event);
    expect(inState).toContain('CancelRequested');
    expect(optionsAt(travel, 'start-1').map((e) => e.event)).toEqual(['TravellerSubmitted']);
    expect(optionsAt(travel, 'end-1')).toEqual([]);
  });

  it('offers the way on from a join at once', () => {
    expect(optionsAt(travel, 'join-1').map((e) => e.event)).toEqual(['BookingReady']);
  });
});

describe('follow', () => {
  it('starts in the initial state', () => {
    expect(follow(order, [])?.map((n) => n.name)).toEqual(['Initial']);
  });

  it('follows the transitions taken', () => {
    expect(follow(order, ['edge-1', 'edge-2', 'edge-4'])?.map((n) => n.name)).toEqual([
      'Initial',
      'Reserving stock',
      'Charging payment',
      'Shipping',
    ]);
  });

  it('follows a loop back to the same state', () => {
    expect(follow(order, ['edge-1', 'edge-2', 'edge-7', 'edge-7'])?.map((n) => n.id)).toEqual([
      'start-1',
      'state-1',
      'state-2',
      'state-2',
      'state-2',
    ]);
  });

  it('gives up on a transition that is not offered, or gone', () => {
    expect(follow(order, ['edge-2'])).toBeNull();
    expect(follow(order, ['edge-1', 'nope'])).toBeNull();
    expect(follow({ direction: 'top-bottom', nodes: [], edges: [] }, [])).toBeNull();
  });
});

describe('doingsOf', () => {
  it('lists what entering the state does: send, publish, request, schedule', () => {
    const node = travel.nodes.find((n) => n.id === 'state-3')!;
    expect(doingsOf(node)).toEqual([
      'Send ReserveHotel',
      'Publish HotelRequested',
      'Request CheckAvailability (wait 5s)',
    ]);
    expect(doingsOf(travel.nodes.find((n) => n.id === 'state-2')!)).toEqual([
      'Send ReserveFlight',
      'Schedule FlightHoldExpired in 15m',
    ]);
    expect(doingsOf(travel.nodes.find((n) => n.id === 'state-4')!)).toEqual([
      'Send AuthorizePayment',
      'Unschedule FlightHoldExpired',
    ]);
    expect(doingsOf(order.nodes[0])).toEqual([]);
  });
});

describe('walkAsText', () => {
  it('writes the path with events, guards and what each state does', () => {
    expect(walkAsText(order, ['edge-1', 'edge-2', 'edge-7'])).toBe(
      [
        'Initial',
        '1. OrderReceived → Reserving stock',
        '   Send ReserveStock',
        '2. StockReserved → Charging payment',
        '   Send ChargePayment',
        '   Schedule PaymentTimeout in 30s',
        '3. PaymentFailed [attempts < 3] → Charging payment',
        '   Send ChargePayment',
        '   Schedule PaymentTimeout in 30s',
      ].join('\n'),
    );
  });

  it('is just the initial state before the first step', () => {
    expect(walkAsText(order, [])).toBe('Initial');
  });

  it('reads (no event) for a transition without one, and is empty for an impossible path', () => {
    const d = {
      ...order,
      edges: order.edges.map((e) => (e.id === 'edge-1' ? { ...e, event: undefined } : e)),
    };
    expect(walkAsText(d, ['edge-1']).split('\n')[1]).toBe('1. (no event) → Reserving stock');
    expect(walkAsText(order, ['edge-9'])).toBe('');
  });
});
