import { createNodeParser } from '@ariadne/masstransit/node';
import { importFromCsharp } from './import-saga';
import { compareWithCode, diagramFromCode, sagaLine } from './drift';

const CODE = `using MassTransit;
namespace Shop;
public class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; }
}
public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    public OrderStateMachine()
    {
        InstanceState(x => x.CurrentState);
        Initially(When(OrderSubmitted).TransitionTo(Submitted));
        During(Submitted, When(OrderShipped).Finalize());
    }
    public State Submitted { get; private set; }
    public Event<OrderSubmitted> OrderSubmitted { get; private set; }
    public Event<OrderShipped> OrderShipped { get; private set; }
}
public record OrderSubmitted(Guid CorrelationId);
public record OrderShipped(Guid CorrelationId);
`;

const FILE = '/w/Order.cs';

/** The diagram the importer would write for CODE. */
async function inSync(): Promise<string> {
  const { diagrams } = importFromCsharp(FILE, CODE, '/w', await createNodeParser());
  return diagrams[0]!.text;
}

describe('compareWithCode', () => {
  it('finds no difference for a diagram that was just imported', async () => {
    const result = compareWithCode(await inSync(), FILE, CODE, await createNodeParser());
    expect(result).toMatchObject({ kind: 'compared', differences: [] });
  });

  it('reports a state that only the code has', async () => {
    const changed = CODE.replace(
      'During(Submitted, When(OrderShipped).Finalize());',
      'During(Submitted, When(OrderShipped).TransitionTo(Shipped));\n        During(Shipped, When(OrderDelivered).Finalize());',
    )
      .replace(
        'public State Submitted',
        'public State Shipped { get; private set; }\n    public State Submitted',
      )
      .replace(
        'public Event<OrderShipped>',
        'public Event<OrderDelivered> OrderDelivered { get; private set; }\n    public Event<OrderShipped>',
      );
    const result = compareWithCode(await inSync(), FILE, changed, await createNodeParser());
    expect(result.kind).toBe('compared');
    if (result.kind !== 'compared') return;
    expect(result.differences.some((d) => d.change === 'extra' && /Shipped/.test(d.message))).toBe(
      true,
    );
  });

  it('reports a state that only the diagram has', async () => {
    const result = compareWithCode(
      await inSync(),
      FILE,
      CODE.replace('During(Submitted, When(OrderShipped).Finalize());', ''),
      await createNodeParser(),
    );
    expect(result.kind).toBe('compared');
    if (result.kind !== 'compared') return;
    expect(result.differences.some((d) => d.change === 'missing')).toBe(true);
  });

  it('skips a diagram that names no C# file', async () => {
    const text = (await inSync()).replace(/^ {2}source: .*\n/m, '');
    expect(compareWithCode(text, FILE, CODE, await createNodeParser())).toMatchObject({
      kind: 'skipped',
    });
  });

  it('skips a diagram that cannot be read', async () => {
    expect(compareWithCode('nodes: [', FILE, CODE, await createNodeParser())).toMatchObject({
      kind: 'skipped',
    });
  });

  it('says so when the class is not in the file', async () => {
    const result = compareWithCode(
      await inSync(),
      FILE,
      'class Other {}',
      await createNodeParser(),
    );
    expect(result).toMatchObject({ kind: 'problem' });
    expect(result.kind === 'problem' && result.message).toMatch(/OrderStateMachine is not in/);
  });

  it('asks for saga.class when the file has several state machines and none is named', async () => {
    const two = `${CODE}\npublic class OtherStateMachine : MassTransitStateMachine<OrderState> { }`;
    const text = (await inSync()).replace(/^ {2}class: .*\n/m, '');
    const result = compareWithCode(text, FILE, two, await createNodeParser());
    expect(result.kind === 'problem' && result.message).toMatch(/Name it in saga\.class/);
  });
});

describe('sagaLine', () => {
  const text = 'version: 3\nsaga:\n  class: A\n  source: A.cs\nnodes: []\n';

  it('finds the line of a key in the saga block', () => {
    expect(sagaLine(text, 'class')).toBe(2);
    expect(sagaLine(text, 'source')).toBe(3);
  });

  it('falls back to the saga line, then to the first line', () => {
    expect(sagaLine('version: 3\nsaga:\n  class: A\nnodes: []\n', 'source')).toBe(1);
    expect(sagaLine('version: 3\nnodes: []\n', 'source')).toBe(0);
  });

  it('does not read a key of another block', () => {
    expect(sagaLine('saga:\n  class: A\nnodes:\n  - source: x\n', 'source')).toBe(0);
  });
});

describe('diagramFromCode', () => {
  it('gives the diagram the code describes, naming the C# file from the diagram’s folder', async () => {
    const parser = await createNodeParser();
    const result = diagramFromCode(await inSync(), '/w', FILE, CODE, parser);
    expect(result?.className).toBe('OrderStateMachine');
    expect(result?.diagram.saga?.source).toBe('Order.cs');
  });

  it('takes the class the diagram names when the file has several', async () => {
    const parser = await createNodeParser();
    const two = `${CODE}\npublic class OtherStateMachine : MassTransitStateMachine<OrderState> { }`;
    expect(diagramFromCode(await inSync(), '/w', FILE, two, parser)?.className).toBe(
      'OrderStateMachine',
    );
  });

  it('gives nothing when the class is gone', async () => {
    const parser = await createNodeParser();
    expect(diagramFromCode(await inSync(), '/w', FILE, 'class Other {}', parser)).toBeUndefined();
  });

  it('takes the only state machine for a diagram that cannot be read', async () => {
    const parser = await createNodeParser();
    expect(diagramFromCode('nodes: [', '/w', FILE, CODE, parser)?.className).toBe(
      'OrderStateMachine',
    );
  });
});
