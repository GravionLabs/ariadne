// A seventh machine for what the six samples do not use: Switch, WhenLeave, Finally, Fault, If without else,
// IfAsync, Catch, CorrelateBy, SetCompletedWhenFinalized and activities (Then / ThenAsync / Respond).
using MassTransit;

namespace Spike.Coverage;

public class CoverageState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
    public string? OrderNumber { get; set; }
    public int Tries { get; set; }
}

public record Started(Guid OrderId, string Kind);
public record Approved(Guid OrderId);
public record Rejected(Guid OrderId);
public record Cancelled(string OrderNumber);
public record DoWork(Guid OrderId);
public record Announce(Guid OrderId);

public class CoverageStateMachine : MassTransitStateMachine<CoverageState>
{
    public CoverageStateMachine()
    {
        InstanceState(x => x.CurrentState, Working, Waiting);

        Event(() => Started, x => x.CorrelateById(c => c.Message.OrderId));
        Event(() => Approved, x => x.CorrelateById(c => c.Message.OrderId));
        Event(() => Rejected, x => x.CorrelateById(c => c.Message.OrderId));
        Event(() => Cancelled, x => x.CorrelateBy((s, c) => s.OrderNumber == c.Message.OrderNumber).SelectId(c => Guid.NewGuid()));

        Initially(
            When(Started)
                .Then(c => c.Saga.Tries = 0)
                .Publish(c => new Announce(c.Message.OrderId))
                .TransitionTo(Waiting));

        During(Working,
            When(Approved)
                .If(c => c.Saga.Tries < 3, then => then.Send(c => new DoWork(c.Message.OrderId)))
                .TransitionTo(Waiting),
            When(Rejected)
                .IfAsync(async c => await Task.FromResult(true), then => then.TransitionTo(Waiting))
                .Finalize());

        During(Waiting,
            When(Approved)
                .Catch<Exception>(ex => ex.TransitionTo(Working))
                .Finalize());

        DuringAny(
            When(Cancelled)
                .Finalize());

        WhenEnter(Working, b => b.Publish(c => new Announce(c.Saga.CorrelationId)));
        WhenLeave(Working, b => b.Then(c => c.Saga.Tries++));
        BeforeEnter(Waiting, b => b.Then(c => { }));
        Finally(b => b.Then(c => { }));
        DuringAny(Ignore(Rejected));
        SetCompletedWhenFinalized();
    }

    public State Working { get; private set; } = null!;
    public State Waiting { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;
    public Event<Approved> Approved { get; private set; } = null!;
    public Event<Rejected> Rejected { get; private set; } = null!;
    public Event<Cancelled> Cancelled { get; private set; } = null!;
}
