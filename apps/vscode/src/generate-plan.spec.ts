import * as path from 'node:path';
import { parseDiagram, type Diagram } from '@ariadne/core';
import { planGeneration, targetFolder } from './generate-plan';

const diagram: Diagram = parseDiagram(`version: 3
name: Order Saga
saga:
  class: OrderStateMachine
  instance: OrderState
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
  - id: state-1
    type: state
    name: Submitted
  - id: end-1
    type: end
    name: Completed
edges:
  - id: edge-1
    source: start-1
    target: state-1
    kind: forward
    event: OrderSubmitted
  - id: edge-2
    source: state-1
    target: end-1
    kind: forward
    event: OrderShipped
`);

const none = { folder: '', namespace: '' };
const diagramFile = path.resolve('/w/docs/order.saga.yaml');
const abs = (p: string) => path.resolve(p);

describe('targetFolder', () => {
  it('is the folder of the diagram by default', () => {
    expect(targetFolder(diagram, diagramFile, none, abs('/w'))).toBe(abs('/w/docs'));
  });

  it('is the folder of the C# file the diagram names', () => {
    const linked = { ...diagram, saga: { ...diagram.saga, source: '../src/Sagas/Order.cs' } };
    expect(targetFolder(linked, diagramFile, none, abs('/w'))).toBe(abs('/w/src/Sagas'));
  });

  it('is the folder of the setting, below the workspace folder, before all others', () => {
    const linked = { ...diagram, saga: { ...diagram.saga, source: '../src/Order.cs' } };
    expect(targetFolder(linked, diagramFile, { ...none, folder: 'src/Gen' }, abs('/w'))).toBe(
      abs('/w/src/Gen'),
    );
  });

  it('ignores the folder setting outside a workspace', () => {
    expect(targetFolder(diagram, diagramFile, { ...none, folder: 'src' }, undefined)).toBe(
      abs('/w/docs'),
    );
  });
});

describe('planGeneration', () => {
  it('plans every file as new when nothing exists', () => {
    const plan = planGeneration(diagram, diagramFile, none, abs('/w'), () => undefined);
    expect(plan.files.map((f) => path.basename(f.path)).sort()).toEqual([
      'Contracts.cs',
      'OrderState.cs',
      'OrderStateMachine.cs',
    ]);
    expect(plan.files.every((f) => f.status === 'new')).toBe(true);
    expect(plan.files.every((f) => path.dirname(f.path) === abs('/w/docs'))).toBe(true);
  });

  it('tells changed from unchanged files', () => {
    const first = planGeneration(diagram, diagramFile, none, abs('/w'), () => undefined);
    const disk = new Map(first.files.map((f) => [f.path, f.content]));
    const [a] = first.files;
    disk.set(a!.path, a!.content + '// edited');
    const plan = planGeneration(diagram, diagramFile, none, abs('/w'), (file) => disk.get(file));
    expect(plan.files.find((f) => f.path === a!.path)?.status).toBe('changed');
    expect(plan.files.filter((f) => f.status === 'unchanged')).toHaveLength(2);
  });

  it('takes the namespace from the setting when the diagram has none', () => {
    const plan = planGeneration(
      diagram,
      diagramFile,
      { ...none, namespace: 'Shop.Orders' },
      abs('/w'),
      () => undefined,
    );
    expect(plan.files.every((f) => f.content.includes('namespace Shop.Orders'))).toBe(true);
  });

  it('prefers the namespace of the diagram over the setting', () => {
    const named = { ...diagram, saga: { ...diagram.saga, namespace: 'Mine' } };
    const plan = planGeneration(
      named,
      diagramFile,
      { ...none, namespace: 'Other' },
      abs('/w'),
      () => undefined,
    );
    expect(plan.files.every((f) => f.content.includes('namespace Mine'))).toBe(true);
    expect(plan.files.some((f) => f.content.includes('Other'))).toBe(false);
  });

  it('passes on what the generator could not do', () => {
    const odd = {
      ...diagram,
      edges: [...diagram.edges, { ...diagram.edges[0]!, id: 'e3', event: undefined }],
    };
    const plan = planGeneration(odd, diagramFile, none, abs('/w'), () => undefined);
    expect(plan.warnings.join(' ')).toMatch(/no event/);
  });
});
