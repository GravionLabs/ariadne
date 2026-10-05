import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Diagram, parseDiagram, serializeDiagram, validate } from '@ariadne/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { IMPORT_LIMITS, ImportResult, SourceFile, importSagas } from './import';
import { createNodeParser } from './node';
import { CSharpParser } from './parser';

const samples = resolve(import.meta.dirname, '../../../samples/sagas');
let parser: CSharpParser;

beforeAll(async () => {
  parser = await createNodeParser();
});

/** The .cs files of one sample directory. */
function sample(dir: string): SourceFile[] {
  return readdirSync(join(samples, dir))
    .filter((f) => f.endsWith('.cs'))
    .map((f) => ({ path: `${dir}/${f}`, content: readFileSync(join(samples, dir, f), 'utf8') }));
}

/** A saga state machine around `body` (the constructor's statements) and `members`. */
function saga(body: string, members = '', extra = ''): SourceFile[] {
  const content = `
using MassTransit;
namespace Demo { ${extra}
public class DemoStateMachine : MassTransitStateMachine<DemoState>
{
    public State Working { get; private set; }
    public State Waiting { get; private set; }
    public Event<Start> Start { get; private set; }
    public Event<Next> Next { get; private set; }
    public Event<Stop> Stop { get; private set; }
    ${members}
    public DemoStateMachine()
    {
        ${body}
    }
}}`;
  return [{ path: 'Demo.cs', content }];
}

const only = (result: ImportResult): Diagram => {
  expect(result.sagas).toHaveLength(1);
  return result.sagas[0].diagram;
};
const edgesOf = (d: Diagram) =>
  d.edges.map((e) => {
    const name = (id: string) => d.nodes.find((n) => n.id === id)!.name;
    return `${name(e.source)} -${e.event}${e.guard ? ` [${e.guard}]` : ''}-> ${name(e.target)}`;
  });
const messages = (r: ImportResult) => r.warnings.map((w) => w.message);

describe('the sample sagas', () => {
  const dirs = readdirSync(samples).filter((d) => d !== 'base-class');

  it.each(dirs)('%s: matches the expected diagram, which is a valid file', (dir) => {
    const result = importSagas(sample(dir), parser);
    expect(result.sagas).toHaveLength(1);
    const expected = readFileSync(
      join(samples, dir, `${result.sagas[0].className}.saga.yaml`),
      'utf8',
    );
    const written = serializeDiagram(result.sagas[0].diagram);
    expect(written).toBe(expected);
    // What the editor can open: it parses back, and has no error.
    expect(validate(parseDiagram(written)).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('order: states, events, transitions and the activities on the states they lead into', () => {
    const result = importSagas(sample('order'), parser);
    const d = only(result);
    expect(edgesOf(d)).toEqual([
      'Initial -OrderSubmitted-> ReservingStock',
      'ReservingStock -StockReserved-> ChargingPayment',
      'ReservingStock -StockUnavailable-> Final',
      'ChargingPayment -PaymentCharged-> Shipping',
      'ChargingPayment -PaymentFailed-> Final',
      'Shipping -OrderShipped-> Final',
    ]);
    expect(d.nodes.filter((n) => n.activities).map((n) => [n.name, n.activities])).toEqual([
      ['ReservingStock', [{ kind: 'command', name: 'ReserveStock' }]],
      ['ChargingPayment', [{ kind: 'command', name: 'ChargePayment' }]],
      ['Shipping', [{ kind: 'command', name: 'ShipOrder' }]],
    ]);
    expect(d.saga).toEqual({
      className: 'OrderStateMachine',
      namespace: 'Shop.Orders',
      instanceType: 'OrderState',
      stateProperty: 'CurrentState',
    });
    expect(d.events).toEqual([
      { name: 'OrderSubmitted', correlation: 'CorrelateById(context => context.Message.OrderId)' },
    ]);
    // Publish before Finalize: nothing happens in a final state, so it is said, not drawn.
    expect(messages(result)).toEqual([
      'OrderStateMachine: OrderRejected on the way to the final state cannot be shown: nothing happens in a final state.',
      'OrderStateMachine: OrderRejected on the way to the final state cannot be shown: nothing happens in a final state.',
      'OrderStateMachine: OrderCompleted on the way to the final state cannot be shown: nothing happens in a final state.',
    ]);
    expect(result.warnings.map((w) => w.line)).toEqual([34, 42, 47]);
  });

  it('order: events no state publishes are outside events, with no source (unknown in code)', () => {
    const d = only(importSagas(sample('order'), parser));
    expect(d.edges.every((e) => e.eventSource === undefined)).toBe(true);
  });

  it('booking: decisions, an outside event in later states, Ignore, DuringAny and correlation', () => {
    const result = importSagas(sample('booking'), parser);
    const d = only(result);
    expect(edgesOf(d)).toEqual([
      'Initial -BookingRequested-> AwaitingPayment',
      'AwaitingPayment -PaymentReceived-> Confirmed',
      'AwaitingPayment -CancelRequested-> Cancelled',
      'Confirmed -CancelRequested-> Cancelled',
      'Confirmed -TripStarted-> Final',
      'Any state -Abort-> Final',
    ]);
    expect(d.nodes.find((n) => n.name === 'Cancelled')?.ignores).toEqual(['PaymentReceived']);
    expect(d.nodes.find((n) => n.type === 'any')).toBeTruthy();
    expect(d.events?.find((e) => e.name === 'PaymentReceived')?.correlation).toBe(
      'CorrelateBy((saga, context) => saga.BookingId == context.Message.BookingId)',
    );
    expect(result.warnings).toEqual([]);
    expect(validate(d).filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('when-enter: WhenEnter and the transitions put their activities on the right state', () => {
    const d = only(importSagas(sample('when-enter'), parser));
    expect(d.nodes.find((n) => n.name === 'Packing')?.activities).toEqual([
      { kind: 'command', name: 'PrintLabel' },
      { kind: 'event', name: 'ParcelBeingPacked' },
    ]);
    expect(d.nodes.find((n) => n.name === 'InTransit')?.activities).toEqual([
      { kind: 'event', name: 'ParcelDispatched' },
    ]);
  });

  it('helpers: partial classes of two files are merged and helper methods are followed', () => {
    const result = importSagas(sample('helpers'), parser);
    const d = only(result);
    expect(d.nodes.map((n) => n.name)).toEqual(['Initial', 'Open', 'Assigned', 'Closed', 'Final']);
    expect(edgesOf(d)).toEqual([
      'Initial -TicketOpened-> Open',
      'Open -TicketAssigned-> Assigned',
      'Open -TicketClosed-> Closed',
      'Assigned -TicketClosed-> Final',
    ]);
    // A helper that returns a whole handler, and a helper that wraps one.
    expect(d.nodes.find((n) => n.name === 'Assigned')?.activities).toEqual([
      { kind: 'command', name: 'NotifyAgent' },
    ]);
    expect(d.nodes.find((n) => n.name === 'Closed')?.activities).toEqual([
      { kind: 'event', name: 'TicketClosedNotice' },
    ]);
  });

  it('helpers: the files can be given in any order, and one file alone finds what it can', () => {
    const [main, states] = sample('helpers');
    const reversed = importSagas([states, main], parser);
    expect(serializeDiagram(only(reversed))).toBe(
      serializeDiagram(only(importSagas([main, states], parser))),
    );
    // Without the file that declares the states, they are still found where they are used.
    const alone = importSagas([states.path.endsWith('States.cs') ? main : states], parser);
    expect(
      alone.warnings.some((w) => w.message.includes('is not declared in the given files')),
    ).toBe(true);
  });

  it('base-class: a state machine through an unknown base class is not found, and that is said', () => {
    const result = importSagas(sample('base-class'), parser);
    expect(result.sagas).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ path: 'base-class/FancyStateMachine.cs', line: 7 });
    expect(result.warnings[0].message).toContain('AuditedStateMachine<FancyState>');
  });

  it('records where each state and transition is in the code', () => {
    const [saga1] = importSagas(sample('order'), parser).sagas;
    expect(saga1.locations.states['state-reserving-stock']).toEqual({
      path: 'order/OrderStateMachine.cs',
      line: 54,
    });
    expect(saga1.locations.transitions['edge-1']).toEqual({
      path: 'order/OrderStateMachine.cs',
      line: 26,
    });
    expect(Object.keys(saga1.locations.transitions)).toHaveLength(6);
  });

  it('is the same every time', () => {
    const run = () => serializeDiagram(only(importSagas(sample('booking'), parser)));
    expect(run()).toBe(run());
  });
});

describe('importSagas on small sagas', () => {
  it('finds a state machine with a braced namespace, a qualified base and a field-declared state', () => {
    const files: SourceFile[] = [
      {
        path: 'A.cs',
        content: `namespace A { namespace B {
          class S : MassTransit.MassTransitStateMachine<I> {
            public State Busy;
            public Event<Go> Go;
            S() { Initially(When(Go).TransitionTo(Busy)); }
          } } }`,
      },
    ];
    const d = only(importSagas(files, parser));
    expect(d.saga).toMatchObject({ className: 'S', namespace: 'A.B', instanceType: 'I' });
    expect(edgesOf(d)).toEqual(['Initial -Go-> Busy']);
  });

  it('finds several sagas in several files, each with its own diagram', () => {
    const one = saga('Initially(When(Start).TransitionTo(Working));').map((f) => ({
      ...f,
      path: 'One.cs',
    }));
    const two = saga('Initially(When(Stop).TransitionTo(Waiting));').map((f) => ({
      path: 'Two.cs',
      content: f.content.replaceAll('DemoStateMachine', 'OtherStateMachine'),
    }));
    const result = importSagas([...one, ...two], parser);
    expect(result.sagas.map((s) => s.className)).toEqual(['DemoStateMachine', 'OtherStateMachine']);
    expect(edgesOf(result.sagas[1].diagram)).toEqual(['Initial -Stop-> Waiting']);
  });

  it('reads classes that are no saga as nothing, without warnings', () => {
    const files = [
      { path: 'P.cs', content: 'public class Plain { public State X { get; set; } }' },
    ];
    expect(importSagas(files, parser)).toEqual({ sagas: [], warnings: [] });
    expect(importSagas([], parser)).toEqual({ sagas: [], warnings: [] });
  });

  it('keeps the saga in its state when a handler has no transition: a transition to itself', () => {
    const d = only(importSagas(saga('During(Working, When(Next).Then(x => { }));'), parser));
    expect(edgesOf(d)).toEqual(['Working -Next-> Working']);
  });

  it('reads Finalize as a transition into the final state, and shows the end node only then', () => {
    const none = only(importSagas(saga('Initially(When(Start).TransitionTo(Working));'), parser));
    expect(none.nodes.some((n) => n.type === 'end')).toBe(false);
    const some = only(importSagas(saga('During(Working, When(Stop).Finalize());'), parser));
    expect(edgesOf(some)).toEqual(['Working -Stop-> Final']);
    expect(some.nodes.filter((n) => n.type === 'end')).toHaveLength(1);
  });

  it('reads TransitionTo(Final) like Finalize', () => {
    const d = only(importSagas(saga('During(Working, When(Stop).TransitionTo(Final));'), parser));
    expect(edgesOf(d)).toEqual(['Working -Stop-> Final']);
  });

  it('takes several states in During: one transition from each', () => {
    const d = only(importSagas(saga('During(Working, Waiting, When(Stop).Finalize());'), parser));
    expect(edgesOf(d)).toEqual(['Working -Stop-> Final', 'Waiting -Stop-> Final']);
  });

  it('turns the filter of When(E, filter) into a guard', () => {
    const d = only(
      importSagas(
        saga('During(Working, When(Next, ctx => ctx.Message.Total > 100).TransitionTo(Waiting));'),
        parser,
      ),
    );
    expect(edgesOf(d)).toEqual(['Working -Next [ctx.Message.Total > 100]-> Waiting']);
  });

  it('reads Send/SendAsync as commands and Publish/PublishAsync as events, from the message created', () => {
    const d = only(
      importSagas(
        saga(`Initially(When(Start)
          .Send(ctx => new A(ctx.Saga.CorrelationId))
          .SendAsync(new Uri("queue:b"), ctx => new B())
          .PublishAsync(ctx => new C())
          .Publish<D>(new { })
          .Publish(ctx => ctx.Init<E>(new { }))
          .TransitionTo(Working));`),
        parser,
      ),
    );
    expect(d.nodes.find((n) => n.name === 'Working')?.activities).toEqual([
      { kind: 'command', name: 'A' },
      { kind: 'command', name: 'B' },
      { kind: 'event', name: 'C' },
      { kind: 'event', name: 'D' },
      { kind: 'event', name: 'E' },
    ]);
  });

  it('keeps every activity of transitions into the same state, once, and says they differ', () => {
    const result = importSagas(
      saga(`
        Initially(When(Start).Send(ctx => new A()).TransitionTo(Working));
        During(Waiting,
          When(Next).Send(ctx => new A()).Publish(ctx => new B()).TransitionTo(Working),
          When(Stop).TransitionTo(Working));`),
      parser,
    );
    expect(only(result).nodes.find((n) => n.name === 'Working')?.activities).toEqual([
      { kind: 'command', name: 'A' },
      { kind: 'event', name: 'B' },
    ]);
    expect(messages(result)).toContain(
      'DemoStateMachine: Transitions into Working do different things; the diagram shows them all on the state.',
    );
  });

  it('puts the activities of WhenEnter first, and does not repeat one a transition has too', () => {
    const d = only(
      importSagas(
        saga(`
          Initially(When(Start).Send(ctx => new A()).TransitionTo(Working));
          WhenEnter(Working, b => b.Publish(ctx => new B()).Send(ctx => new A()));`),
        parser,
      ),
    );
    expect(d.nodes.find((n) => n.name === 'Working')?.activities).toEqual([
      { kind: 'event', name: 'B' },
      { kind: 'command', name: 'A' },
    ]);
  });

  it('warns, with the line, about what is not shown yet, and about code that is left out', () => {
    const result = importSagas(
      saga(`Initially(When(Start)
          .Then(ctx => { })
          .Then(ctx => { })
          .Schedule(Reminder, ctx => new Remind())
          .Unschedule(Reminder)
          .TransitionTo(Working));
        WhenLeave(Working, b => b.Then(c => { }));`),
      parser,
    );
    expect(messages(result)).toEqual([
      'DemoStateMachine: Then(…) runs code; it is left out of the diagram.',
      'DemoStateMachine: Schedule(…) is not shown in the diagram yet.',
      'DemoStateMachine: Unschedule(…) is not shown in the diagram yet.',
      'DemoStateMachine: WhenLeave(…) is not shown in the diagram yet.',
    ]);
    // `Then` is said once, at its first place; the others where they are.
    expect(result.warnings.map((w) => w.line)).toEqual([15, 17, 18, 20]);
    expect(edgesOf(only(result))).toEqual(['Initial -Start-> Working']);
  });

  it('says so for declarations in the constructor that are not drawn, instead of dropping them', () => {
    const result = importSagas(
      saga(`Schedule(() => Reminder, x => x.TimeoutId, s => s.Delay = TimeSpan.FromMinutes(1));
        Fault<Start>(Start);
        OnUnhandledEvent(x => x.Ignore());
        Initially(When(Start).TransitionTo(Working));`),
      parser,
    );
    expect(messages(result)).toEqual([
      'DemoStateMachine: Schedule(…) is not shown in the diagram yet.',
      'DemoStateMachine: Fault(…) is not shown in the diagram yet.',
      'DemoStateMachine: OnUnhandledEvent(…) is not shown in the diagram yet.',
    ]);
  });

  it('reads If and IfElse as guarded transitions, the rest being the way out', () => {
    const d = only(
      importSagas(
        saga(`Initially(When(Start)
            .Publish(ctx => new B())
            .If(ctx => ctx.Message.Big, then => then.Send(ctx => new A()).TransitionTo(Working))
            .TransitionTo(Waiting));
          During(Working,
            When(Next).IfElse(ctx => ctx.Message.Fast,
              yes => yes.TransitionTo(Waiting),
              no => no.Finalize()));`),
        parser,
      ),
    );
    expect(edgesOf(d)).toEqual([
      'Initial -Start [ctx.Message.Big]-> Working',
      'Initial -Start [!(ctx.Message.Big)]-> Waiting',
      'Working -Next [ctx.Message.Fast]-> Waiting',
      'Working -Next [!(ctx.Message.Fast)]-> Final',
    ]);
    expect(d.nodes.find((n) => n.name === 'Working')?.activities).toEqual([
      { kind: 'event', name: 'B' },
      { kind: 'command', name: 'A' },
    ]);
  });

  it('warns about an If that cannot be read or is nested, and about code in a branch', () => {
    const result = importSagas(
      saga(`Initially(When(Start)
          .If(ctx => true, then => then.Then(c => { }).If(c => true, t => t.TransitionTo(Waiting)).TransitionTo(Working)));`),
      parser,
    );
    expect(messages(result)).toEqual([
      'DemoStateMachine: Then(…) runs code; it is left out of the diagram.',
      'DemoStateMachine: If(…) is not shown in the diagram yet.',
    ]);
  });

  it('reads a request: the declaration, the call on entry and the three answers', () => {
    const result = importSagas(
      saga(`Request(() => Ask, x => x.RequestId, r => r.Timeout = TimeSpan.FromSeconds(30));
        Initially(When(Start).Request(Ask, ctx => new AskIt()).TransitionTo(Working));
        During(Working,
          When(Ask.Completed).TransitionTo(Waiting),
          When(Ask.Faulted).Finalize(),
          When(Ask.TimeoutExpired).TransitionTo(Waiting));`),
      parser,
    );
    const d = only(result);
    expect(messages(result)).toEqual([]);
    expect(d.nodes.find((n) => n.name === 'Working')?.requests).toEqual([
      { name: 'Ask', timeout: '30s' },
    ]);
    expect(edgesOf(d)).toEqual([
      'Initial -Start-> Working',
      'Working -Ask.Completed-> Waiting',
      'Working -Ask.Faulted-> Final',
      'Working -Ask.TimeoutExpired-> Waiting',
    ]);
  });

  it('reads a request made in WhenEnter, keeps an odd timeout as written, and a request without one', () => {
    const d = only(
      importSagas(
        saga(`Request(() => Ask, x => x.RequestId, r => r.Timeout = Settings.AskTimeout);
          Request(() => Check, x => x.CheckId);
          Initially(When(Start).TransitionTo(Working));
          WhenEnter(Working, b => b.Request(Ask, ctx => new AskIt()).Request(Check, ctx => new CheckIt()));`),
        parser,
      ),
    );
    expect(d.nodes.find((n) => n.name === 'Working')?.requests).toEqual([
      { name: 'Ask', timeout: 'Settings.AskTimeout' },
      { name: 'Check' },
    ]);
  });

  it('warns about a request on the way to the final state', () => {
    const result = importSagas(
      saga(`Initially(When(Start).TransitionTo(Working));
        During(Working, When(Next).Request(Ask, ctx => new AskIt()).Finalize());`),
      parser,
    );
    expect(messages(result)).toEqual([
      'DemoStateMachine: Ask on the way to the final state cannot be shown: nothing happens in a final state.',
    ]);
  });

  it('does not draw what cannot be drawn, and says so', () => {
    const result = importSagas(
      saga(`
        Initially(When(Start).Then(ctx => { }));
        DuringAny(When(Stop).Then(ctx => { }));
        During(Working, When(Next).TransitionTo(Initial));`),
      parser,
    );
    expect(only(result).edges).toEqual([]);
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        'DemoStateMachine: When(Start) stays in or returns to the initial state: not drawn.',
        'DemoStateMachine: DuringAny(When(Stop)…) leads nowhere: not drawn.',
        'DemoStateMachine: When(Next) stays in or returns to the initial state: not drawn.',
      ]),
    );
  });

  it('names a state that is used but not declared, and says so', () => {
    const result = importSagas(saga('Initially(When(Start).TransitionTo(Inherited));'), parser);
    expect(only(result).nodes.map((n) => n.name)).toContain('Inherited');
    expect(messages(result)).toContain(
      'DemoStateMachine: The state Inherited is not declared in the given files.',
    );
  });

  it('warns about a handler it cannot read, and a message type it cannot find', () => {
    const result = importSagas(
      saga('Initially(Handlers(), When(Start).Send(ctx => Make()).TransitionTo(Working));'),
      parser,
    );
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('The message type of Send(…) could not be read.'),
      ]),
    );
    expect(edgesOf(only(result))).toEqual(['Initial -Start-> Working']);
  });

  it('gives states with the same slug different ids', () => {
    const d = only(
      importSagas(
        saga('', 'public State FooBar { get; set; } public State Foo_Bar { get; set; }'),
        parser,
      ),
    );
    const ids = d.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('survives a file that is not valid C#', () => {
    const result = importSagas([{ path: 'Broken.cs', content: 'class { ( ' }], parser);
    expect(result.sagas).toEqual([]);
  });
});

describe('createCSharpParser', () => {
  it('takes the tree-sitter runtime and the grammar as bytes too, as a bundler hands them over', async () => {
    const { readFile } = await import('node:fs/promises');
    const { createRequire } = await import('node:module');
    const { createCSharpParser } = await import('./parser');
    const require = createRequire(import.meta.url);
    const fromBytes = await createCSharpParser({
      grammar: new Uint8Array(
        await readFile(require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm')),
      ),
      runtime: new Uint8Array(
        await readFile(require.resolve('web-tree-sitter/web-tree-sitter.wasm')),
      ),
    });
    const files = sample('order');
    expect(serializeDiagram(only(importSagas(files, fromBytes)))).toBe(
      serializeDiagram(only(importSagas(files, parser))),
    );
  });
});

describe('importSagas limits', () => {
  const content = (bytes: number) => `// ${'x'.repeat(bytes - 4)}\n`;

  it('reads a file of exactly the largest size', () => {
    const file = { path: 'Big.cs', content: content(IMPORT_LIMITS.maxFileBytes) };
    expect(new TextEncoder().encode(file.content).byteLength).toBe(IMPORT_LIMITS.maxFileBytes);
    expect(importSagas([file], parser)).toEqual({ sagas: [], warnings: [] });
  });

  it('skips a file one byte over with a warning on that file, and reads the others', () => {
    const big = { path: 'Big.cs', content: content(IMPORT_LIMITS.maxFileBytes + 1) };
    const result = importSagas([big, ...sample('order')], parser);
    expect(result.warnings.filter((w) => w.path === 'Big.cs')).toEqual([
      {
        path: 'Big.cs',
        line: 1,
        message: 'This file is 2 MB; Ariadne imports C# files up to 2 MB. It was skipped.',
      },
    ]);
    expect(result.sagas).toHaveLength(1);
  });

  it('counts bytes, not characters', () => {
    const wide = { path: 'Wide.cs', content: `// ${'é'.repeat(IMPORT_LIMITS.maxFileBytes / 2)}\n` };
    expect(wide.content.length).toBeLessThan(IMPORT_LIMITS.maxFileBytes);
    expect(importSagas([wide], parser).warnings.map((w) => w.path)).toEqual(['Wide.cs']);
  });
});
