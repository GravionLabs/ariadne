using MassTransit;

namespace Acme.Accounts;

/// <summary>What the saga remembers about one customer between messages.</summary>
public class CustomerOnboardingState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
    public Guid? ReminderTokenId { get; set; }
    public Guid? ExpiryTokenId { get; set; }
    public Guid? IdentityCheckRequestId { get; set; }
}
