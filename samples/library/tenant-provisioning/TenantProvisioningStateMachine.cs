using MassTransit;
using MassTransit.Courier.Contracts;

namespace Acme.Tenants;

/// <summary>
/// Sets up a new tenant of a hosted product: a routing slip creates the tenant, its database and
/// its admin user, and sends the welcome mail. A failed set-up is undone step by step by Courier;
/// the saga only hears how it ended. A cancelled tenant is taken down by a second routing slip.
/// </summary>
public class TenantProvisioningStateMachine : MassTransitStateMachine<TenantProvisioningState>
{
    public TenantProvisioningStateMachine()
    {
        InstanceState(x => x.CurrentState, Provisioning, Active, ProvisioningFailed, Deprovisioning, NeedsAttention);

        Event(() => TenantRequested);
        Event(() => ProvisioningRetried);
        Event(() => TenantCancelled);
        Event(() => CleanupConfirmed);

        // Courier publishes how a routing slip ended. The saga set the slip's tracking number to its
        // own CorrelationId, so that is what finds it; the state it is in says which slip it was.
        Event(() => RoutingSlipCompleted, x => x.CorrelateById(context => context.Message.TrackingNumber));
        Event(() => RoutingSlipFaulted, x => x.CorrelateById(context => context.Message.TrackingNumber));

        Initially(
            When(TenantRequested)
                .TransitionTo(Provisioning));

        During(Provisioning,
            When(RoutingSlipCompleted)
                .TransitionTo(Active),
            When(RoutingSlipFaulted)
                .TransitionTo(ProvisioningFailed));

        During(ProvisioningFailed,
            When(ProvisioningRetried)
                .TransitionTo(Provisioning));

        During(Active,
            When(TenantCancelled)
                .TransitionTo(Deprovisioning));

        During(Deprovisioning,
            When(RoutingSlipCompleted)
                .Finalize(),
            When(RoutingSlipFaulted)
                .TransitionTo(NeedsAttention));

        During(NeedsAttention,
            When(CleanupConfirmed)
                .Finalize());

        // Entering Provisioning (again after a retry) runs the whole set-up. Courier undoes the
        // steps that compensate, last first, when a later one fails.
        WhenEnter(Provisioning, binder => binder
            .ThenAsync(async context =>
            {
                // Routing slip: Provision
                var builder = new RoutingSlipBuilder(context.Saga.CorrelationId);
                builder.AddActivity("CreateTenant", new Uri("queue:create-tenant_execute")); // compensates
                builder.AddActivity("CreateDatabase", new Uri("queue:create-database_execute")); // compensates
                builder.AddActivity("CreateAdminUser", new Uri("queue:create-admin-user_execute")); // compensates
                builder.AddActivity("SendWelcomeMail", new Uri("queue:send-welcome-mail_execute"));
                builder.AddSubscription(context.ReceiveContext.InputAddress, RoutingSlipEvents.Completed | RoutingSlipEvents.Faulted);
                await context.Execute(builder.Build());
            }));

        WhenEnter(Active, binder => binder
            .Publish(context => new TenantActivated(context.Saga.CorrelationId)));

        WhenEnter(ProvisioningFailed, binder => binder
            .Publish(context => new TenantProvisioningFailed(context.Saga.CorrelationId)));

        // Taking a tenant down cannot be undone, so nothing in this slip compensates.
        WhenEnter(Deprovisioning, binder => binder
            .ThenAsync(async context =>
            {
                // Routing slip: Deprovision
                var builder = new RoutingSlipBuilder(context.Saga.CorrelationId);
                builder.AddActivity("ExportData", new Uri("queue:export-data_execute"));
                builder.AddActivity("DropDatabase", new Uri("queue:drop-database_execute"));
                builder.AddActivity("DeleteTenant", new Uri("queue:delete-tenant_execute"));
                builder.AddSubscription(context.ReceiveContext.InputAddress, RoutingSlipEvents.Completed | RoutingSlipEvents.Faulted);
                await context.Execute(builder.Build());
            }));

        WhenEnter(NeedsAttention, binder => binder
            .Send(context => new OpenSupportTicket(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State Provisioning { get; private set; } = null!;
    public State Active { get; private set; } = null!;
    public State ProvisioningFailed { get; private set; } = null!;
    public State Deprovisioning { get; private set; } = null!;
    public State NeedsAttention { get; private set; } = null!;

    public Event<TenantRequested> TenantRequested { get; private set; } = null!;
    public Event<ProvisioningRetried> ProvisioningRetried { get; private set; } = null!;
    public Event<TenantCancelled> TenantCancelled { get; private set; } = null!;
    public Event<CleanupConfirmed> CleanupConfirmed { get; private set; } = null!;
    public Event<RoutingSlipCompleted> RoutingSlipCompleted { get; private set; } = null!;
    public Event<RoutingSlipFaulted> RoutingSlipFaulted { get; private set; } = null!;
}
