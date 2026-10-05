using MassTransit;

namespace Acme.Lending;

/// <summary>What the saga remembers about one application between messages.</summary>
public class LoanApplicationState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
    public int ChecksStatus { get; set; }
}
