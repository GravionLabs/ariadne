using MassTransit;

namespace Acme.Payments;

/// <summary>What the saga remembers about one payment between messages.</summary>
public class PaymentRetriesState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}
