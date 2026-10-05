using MassTransit;

namespace Acme.Tenants;

/// <summary>What the saga remembers about one tenant between messages.</summary>
public class TenantProvisioningState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public int CurrentState { get; set; }
}
