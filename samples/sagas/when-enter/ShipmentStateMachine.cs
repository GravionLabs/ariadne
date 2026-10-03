using MassTransit;

namespace Warehouse.Shipments;

public class ShipmentState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}

// What a state does on entering it: WhenEnter, next to Send and Publish on a transition.
public class ShipmentStateMachine : MassTransitStateMachine<ShipmentState>
{
    public State Packing { get; private set; } = null!;
    public State InTransit { get; private set; } = null!;

    public Event<ShipmentRequested> ShipmentRequested { get; private set; } = null!;
    public Event<ParcelPacked> ParcelPacked { get; private set; } = null!;
    public Event<ParcelDelivered> ParcelDelivered { get; private set; } = null!;

    public ShipmentStateMachine()
    {
        InstanceState(x => x.CurrentState);

        Event(() => ShipmentRequested);
        Event(() => ParcelPacked);
        Event(() => ParcelDelivered);

        Initially(
            When(ShipmentRequested)
                .TransitionTo(Packing));

        During(Packing,
            When(ParcelPacked)
                .TransitionTo(InTransit));

        During(InTransit,
            When(ParcelDelivered)
                .Finalize());

        WhenEnter(Packing, binder => binder
            .Send(context => new PrintLabel(context.Saga.CorrelationId))
            .Publish(context => new ParcelBeingPacked(context.Saga.CorrelationId)));

        WhenEnter(InTransit, binder => binder
            .Publish(context => new ParcelDispatched(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }
}
