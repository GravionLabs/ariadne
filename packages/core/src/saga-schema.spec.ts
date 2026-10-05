import Ajv from 'ajv';
import { parse } from 'yaml';
import schema from '../../../docs/specs/saga.schema.json';
import order from '../../../docs/examples/order.saga.yaml?raw';
import travel from '../../../docs/examples/travel-booking.saga.yaml?raw';
import booking from '../../../samples/sagas/booking/BookingStateMachine.saga.yaml?raw';
import ticket from '../../../samples/sagas/helpers/TicketStateMachine.saga.yaml?raw';
import orderSample from '../../../samples/sagas/order/OrderStateMachine.saga.yaml?raw';
import shipment from '../../../samples/sagas/when-enter/ShipmentStateMachine.saga.yaml?raw';
import { parseDiagram } from './diagram-yaml';

// docs/specs/saga.schema.json is what editors validate `*.saga.yaml` against. It is written by
// hand, so these specs keep it in step with the parser: what the parser reads, the schema accepts,
// and the mistakes the schema can see, the parser rejects too.
const validate = new Ajv({ strict: false }).compile(schema);
const schemaAccepts = (text: string): boolean => validate(parse(text)) as boolean;
const parserAccepts = (text: string): boolean => {
  try {
    parseDiagram(text);
    return true;
  } catch {
    return false;
  }
};

const nodes = `
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Working
`;

describe('saga.schema.json accepts what the parser reads', () => {
  it.each([
    ['docs/examples/order', order],
    ['docs/examples/travel-booking', travel],
    ['samples booking', booking],
    ['samples ticket', ticket],
    ['samples order', orderSample],
    ['samples shipment', shipment],
  ])('%s', (_name, text) => {
    expect(parserAccepts(text)).toBe(true);
    expect(validate(parse(text)) ? [] : validate.errors).toEqual([]);
  });

  it('accepts a file with only a version', () => {
    expect(schemaAccepts('version: 3')).toBe(true);
    expect(parserAccepts('version: 3')).toBe(true);
  });

  it('accepts every field of the format', () => {
    const text = `version: 3
name: Everything
description: All of it
saga:
  class: AStateMachine
  namespace: Shop
  instance: AState
  stateProperty: CurrentState
  contractsNamespace: Shop.Contracts
  source: ../A.cs
events:
  - name: Started
    messageType: StartIt
    correlation: CorrelationId
direction: left-right
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Working
    description: Does things
    color: '#12abEF'
    activities:
      - command: DoIt
      - event: ItWasDone
    ignores: [Noise]
    requests:
      - request: Ask
        timeout: 30s
    timers:
      - schedule: TooLate
        delay: 1m
      - unschedule: TooLate
    retry: 3 attempts
    timeout: 30s
    compensation:
      name: UndoIt
      description: Takes it back
  - id: c
    type: any
    name: Any
  - id: d
    type: join
    name: BothArrived
  - id: e
    type: end
    name: Done
    color: teal
edges:
  - id: e1
    source: a
    target: b
    kind: compensation
    event: Started
    eventSource: Shop API
    guard: amount > 100
`;
    expect(parserAccepts(text)).toBe(true);
    expect(validate(parse(text)) ? [] : validate.errors).toEqual([]);
  });
});

describe('saga.schema.json rejects what the parser rejects', () => {
  // Each of these is wrong in a way the schema can see.
  it.each([
    ['no version', 'name: x'],
    ['an unknown version', 'version: 4'],
    ['a name that is not text', 'version: 3\nname: [a]'],
    ['nodes that are not a list', 'version: 3\nnodes: {}'],
    ['a node without an id', `version: 3\nnodes:\n  - type: state\n    name: A`],
    ['a node without a name', `version: 3\nnodes:\n  - id: a\n    type: state`],
    ['an unknown node type', `version: 3\nnodes:\n  - id: a\n    type: step\n    name: A`],
    [
      'an unknown color',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    color: mauve`,
    ],
    [
      'a short hex color',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    color: '#fff'`,
    ],
    [
      'activities on a final state',
      `version: 3\nnodes:\n  - id: a\n    type: end\n    name: A\n    activities:\n      - event: X`,
    ],
    [
      'activities on an initial state',
      `version: 3\nnodes:\n  - id: a\n    type: start\n    name: A\n    activities:\n      - command: X`,
    ],
    [
      'ignores on a join',
      `version: 3\nnodes:\n  - id: a\n    type: join\n    name: A\n    ignores: [X]`,
    ],
    [
      'requests on the any node',
      `version: 3\nnodes:\n  - id: a\n    type: any\n    name: A\n    requests:\n      - request: X`,
    ],
    [
      'timers on a final state',
      `version: 3\nnodes:\n  - id: a\n    type: end\n    name: A\n    timers:\n      - schedule: X`,
    ],
    [
      'an activity of an unknown kind',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    activities:\n      - message: X`,
    ],
    [
      'an activity with two keys',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    activities:\n      - command: X\n        event: Y`,
    ],
    [
      'an empty activity name',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    activities:\n      - command: ''`,
    ],
    [
      'a request without a name',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    requests:\n      - timeout: 30s`,
    ],
    [
      'a timer that does neither',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    timers:\n      - delay: 30s`,
    ],
    [
      'a timer that does both',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    timers:\n      - schedule: X\n        unschedule: X`,
    ],
    [
      'a delay on an unschedule',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    timers:\n      - unschedule: X\n        delay: 5s`,
    ],
    [
      'a compensation without a name',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n    compensation:\n      description: d`,
    ],
    ['an edge without a source', `version: 3${nodes}edges:\n  - id: e\n    target: b`],
    ['an edge without an id', `version: 3${nodes}edges:\n  - source: a\n    target: b`],
    [
      'an unknown edge kind',
      `version: 3${nodes}edges:\n  - id: e\n    source: a\n    target: b\n    kind: backward`,
    ],
    [
      'a guard without an event',
      `version: 3${nodes}edges:\n  - id: e\n    source: a\n    target: b\n    guard: x > 1`,
    ],
    [
      'activities on an edge',
      `version: 3${nodes}edges:\n  - id: e\n    source: a\n    target: b\n    activities:\n      - event: X`,
    ],
    ['an event entry without a name', 'version: 3\nevents:\n  - messageType: X'],
    ['a saga block that is not a mapping', 'version: 3\nsaga: text'],
  ])('%s', (_name, text) => {
    expect(parserAccepts(text)).toBe(false);
    expect(schemaAccepts(text)).toBe(false);
  });

  it('rejects a key the format does not have, which the parser would ignore', () => {
    const text = 'version: 3\nnamee: typo';
    expect(schemaAccepts(text)).toBe(false);
    expect(parserAccepts(text)).toBe(true);
  });
});

describe('saga.schema.json leaves to Ariadne what it cannot see', () => {
  // These need the whole file; the editor reports them as problems of its own.
  it.each([
    [
      'duplicate node ids',
      `version: 3\nnodes:\n  - id: a\n    type: state\n    name: A\n  - id: a\n    type: state\n    name: B`,
    ],
    [
      'an edge to a node that is not there',
      `version: 3${nodes}edges:\n  - id: e\n    source: a\n    target: zzz`,
    ],
    [
      'two any nodes',
      `version: 3\nnodes:\n  - id: a\n    type: any\n    name: A\n  - id: b\n    type: any\n    name: B`,
    ],
    ['an event described twice', 'version: 3\nevents:\n  - name: X\n  - name: X'],
  ])('%s', (_name, text) => {
    expect(parserAccepts(text)).toBe(false);
    expect(schemaAccepts(text)).toBe(true);
  });
});

describe('saga.schema.json and the layout options', () => {
  it('accepts the four directions and the three spacings', () => {
    for (const direction of ['top-bottom', 'bottom-top', 'left-right', 'right-left']) {
      for (const spacing of ['compact', 'normal', 'spacious']) {
        const text = `version: 3\ndirection: ${direction}\nspacing: ${spacing}`;
        expect(validate(parse(text)) ? [] : validate.errors, text).toEqual([]);
      }
    }
  });

  it('flags an unknown direction or spacing in the editor, which the reader only works around', () => {
    expect(validate(parse('version: 3\ndirection: sideways'))).toBe(false);
    expect(validate(parse('version: 3\nspacing: roomy'))).toBe(false);
  });
});
