using MassTransit;

namespace Insurance.Claims;

public class ClaimState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}

public record ClaimFiled(Guid ClaimId, string Policy);
public record ClaimAssessed(Guid ClaimId, bool Covered);
public record ClaimPaid(Guid ClaimId);
public record ClaimWithdrawn(Guid ClaimId);

// The importer cannot find this machine: its base class is another class of the project, not MassTransitStateMachine
// itself. A built machine is the same whatever it derives from, so the exporter reads it.
public abstract class AuditedStateMachine<TInstance> : MassTransitStateMachine<TInstance>
    where TInstance : class, SagaStateMachineInstance
{
}

public class ClaimStateMachine : AuditedStateMachine<ClaimState>
{
    public ClaimStateMachine()
    {
        InstanceState(x => x.CurrentState, Assessing, Paying);

        Event(() => Filed, x => x.CorrelateById(c => c.Message.ClaimId));
        Event(() => Assessed, x => x.CorrelateById(c => c.Message.ClaimId));
        Event(() => Paid, x => x.CorrelateById(c => c.Message.ClaimId));
        Event(() => Withdrawn, x => x.CorrelateById(c => c.Message.ClaimId));

        Initially(
            When(Filed)
                .TransitionTo(Assessing));

        During(Assessing,
            When(Assessed)
                .TransitionTo(Paying));

        During(Paying,
            When(Paid)
                .Finalize(),
            Ignore(Assessed));

        DuringAny(
            When(Withdrawn)
                .Finalize());

        SetCompletedWhenFinalized();
    }

    public State Assessing { get; private set; } = null!;
    public State Paying { get; private set; } = null!;

    public Event<ClaimFiled> Filed { get; private set; } = null!;
    public Event<ClaimAssessed> Assessed { get; private set; } = null!;
    public Event<ClaimPaid> Paid { get; private set; } = null!;
    public Event<ClaimWithdrawn> Withdrawn { get; private set; } = null!;
}
