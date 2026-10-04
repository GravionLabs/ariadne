using MassTransit;

namespace Acme.Travel;

/// <summary>What the saga remembers about one trip between messages.</summary>
public class TripBookingState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}
