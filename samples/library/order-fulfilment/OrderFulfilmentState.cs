using MassTransit;

namespace Acme.Orders;

/// <summary>What the saga remembers about one order between messages.</summary>
public class OrderFulfilmentState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}
