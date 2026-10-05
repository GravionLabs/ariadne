import { DEFAULT_CORRELATION, Diagram, SLIP_OUTCOMES, slipEvent } from '@ariadne/core';
import { identifier } from './generate';

/** What differs between a diagram and the code that is meant to implement it. */
export interface Difference {
  kind: 'state' | 'transition' | 'event' | 'activity' | 'ignore' | 'routingSlip';
  /** `missing`: in the diagram, not in the code. `extra`: in the code, not in the diagram. */
  change: 'missing' | 'extra' | 'changed';
  /** One sentence, e.g. `Transition ReservingStock → ChargingPayment on StockReserved is not in the code.` */
  message: string;
}

/** What a diagram says, as comparable text; names are the identifiers the code would use. */
interface Facts {
  states: Set<string>;
  transitions: Map<string, string>;
  events: Map<string, string>;
  activities: Map<string, string>;
  /** `State: routing slip Name` → its itinerary, e.g. `CreateTenant (compensates) → SendMail`. */
  slips: Map<string, string>;
  ignores: Map<string, string>;
}

const END = 'Final';
const START = 'Initial';
const ANY = 'Any';

function factsOf(diagram: Diagram): Facts {
  const names = new Map(
    diagram.nodes.map((n) => [
      n.id,
      n.type === 'start'
        ? START
        : n.type === 'end'
          ? END
          : n.type === 'any'
            ? ANY
            : identifier(n.name, 'State'),
    ]),
  );
  const facts: Facts = {
    states: new Set(diagram.nodes.filter((n) => n.type === 'state').map((n) => names.get(n.id)!)),
    transitions: new Map(),
    events: new Map(),
    activities: new Map(),
    slips: new Map(),
    ignores: new Map(),
  };
  const info = new Map((diagram.events ?? []).map((e) => [e.name, e]));
  const usedEvents = new Set<string>();

  for (const e of diagram.edges) {
    // Transitions without an event, and those around a join, are not in generated code.
    if (!e.event) continue;
    const source = names.get(e.source);
    const target = names.get(e.target);
    if (
      !source ||
      !target ||
      diagram.nodes.some((n) => n.type === 'join' && (n.id === e.source || n.id === e.target))
    )
      continue;
    const event = identifier(e.event, 'Event');
    usedEvents.add(event);
    const key = `${source} → ${target} on ${event}`;
    facts.transitions.set(key, `Transition ${key}`);
  }
  for (const n of diagram.nodes) {
    const state = names.get(n.id)!;
    for (const a of n.activities ?? []) {
      const key = `${state}: ${a.kind === 'command' ? 'send' : 'publish'} ${identifier(a.name, 'Message')}`;
      facts.activities.set(
        key,
        `State ${state} ${a.kind === 'command' ? 'sends' : 'publishes'} ${identifier(a.name, 'Message')}`,
      );
    }
    for (const slip of n.routingSlips ?? []) {
      facts.slips.set(
        `${state}: routing slip ${identifier(slip.name, 'RoutingSlip')}`,
        slip.activities
          .map((a) => identifier(a.name, 'Activity') + (a.compensates ? ' (compensates)' : ''))
          .join(' → '),
      );
    }
    for (const ignored of n.ignores ?? []) {
      const event = identifier(ignored, 'Event');
      usedEvents.add(event);
      facts.ignores.set(`${state}: ${event}`, `State ${state} ignores ${event}`);
    }
  }
  // The outcomes of a routing slip are Courier's messages, correlated by the tracking number.
  const outcomes = new Set(
    diagram.nodes.flatMap((n) =>
      (n.routingSlips ?? []).flatMap((s) =>
        SLIP_OUTCOMES.map((o) => identifier(slipEvent(s.name, o), 'Event')),
      ),
    ),
  );
  for (const name of usedEvents) {
    if (outcomes.has(name)) continue;
    const original = [...info.keys()].find((k) => identifier(k, 'Event') === name);
    const meta = original ? info.get(original) : undefined;
    const type = identifier(meta?.messageType ?? name, 'Message');
    const correlation = (meta?.correlation ?? DEFAULT_CORRELATION).replace(/\s+/g, ' ').trim();
    facts.events.set(name, `${type}, correlated by ${correlation}`);
  }
  return facts;
}

/**
 * Compares a diagram with the diagram read from its code (`importSagas`): states, transitions
 * (source, target and event), what states send and publish, the routing slips they start and their
 * itineraries, ignored events, and the message type and
 * correlation of each event. Names are compared as the identifiers generated code would have, so
 * `Charging payment` and `ChargingPayment` are the same state. Guards are free text and are not
 * compared; layout, colors, descriptions and notes never reach the code and are left out.
 */
export function diffDiagrams(diagram: Diagram, code: Diagram): Difference[] {
  const expected = factsOf(diagram);
  const actual = factsOf(code);
  const out: Difference[] = [];

  const compareKeys = (
    kind: Difference['kind'],
    a: Map<string, string>,
    b: Map<string, string>,
    what: (text: string) => string,
  ): void => {
    for (const [key, text] of a) {
      if (!b.has(key))
        out.push({
          kind,
          change: 'missing',
          message: `${what(text)} is in the diagram, not in the code.`,
        });
    }
    for (const [key, text] of b) {
      if (!a.has(key))
        out.push({
          kind,
          change: 'extra',
          message: `${what(text)} is in the code, not in the diagram.`,
        });
    }
  };

  compareKeys(
    'state',
    new Map([...expected.states].map((s) => [s, s])),
    new Map([...actual.states].map((s) => [s, s])),
    (s) => `State ${s}`,
  );
  compareKeys('transition', expected.transitions, actual.transitions, (t) => t);
  compareKeys('activity', expected.activities, actual.activities, (t) => t);
  compareKeys('ignore', expected.ignores, actual.ignores, (t) => t);
  const slipText = (key: string): string => {
    const [state, slip] = key.split(': routing slip ');
    return `State ${state} starts routing slip ${slip}`;
  };
  compareKeys(
    'routingSlip',
    new Map([...expected.slips.keys()].map((k) => [k, slipText(k)])),
    new Map([...actual.slips.keys()].map((k) => [k, slipText(k)])),
    (t) => t,
  );
  for (const [key, itinerary] of expected.slips) {
    const found = actual.slips.get(key);
    if (found !== undefined && found !== itinerary) {
      out.push({
        kind: 'routingSlip',
        change: 'changed',
        message: `${slipText(key)}: ${itinerary || 'no activity'} in the diagram, ${found || 'no activity'} in the code.`,
      });
    }
  }
  for (const [name, text] of expected.events) {
    const found = actual.events.get(name);
    if (found !== undefined && found !== text) {
      out.push({
        kind: 'event',
        change: 'changed',
        message: `Event ${name} is ${text} in the diagram, ${found} in the code.`,
      });
    }
  }
  return out;
}
