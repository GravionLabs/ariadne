namespace Acme.Tenants;

// Every message carries the CorrelationId of the tenant, which is how MassTransit finds the saga.
// How a routing slip ended comes from Courier (RoutingSlipCompleted, RoutingSlipFaulted).

// Events from the sign-up page, the operators and the billing service.
public record TenantRequested(Guid CorrelationId, string Name);
public record ProvisioningRetried(Guid CorrelationId);
public record TenantCancelled(Guid CorrelationId);
public record CleanupConfirmed(Guid CorrelationId);

// Commands the saga sends.
public record OpenSupportTicket(Guid CorrelationId);

// Events the saga publishes.
public record TenantActivated(Guid CorrelationId);
public record TenantProvisioningFailed(Guid CorrelationId);
