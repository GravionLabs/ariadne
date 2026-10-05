# Tenant provisioning

Sets up a new tenant of a hosted product with a MassTransit routing slip, and takes it down again with a second one when the tenant is cancelled.

## The process

A request for a tenant moves the saga to **Provisioning**, which starts the `Provision` **routing slip**: create the tenant, create its database, create its admin user, send the welcome mail. Courier runs the steps one after the other; the saga does not see them, only how the slip ended:

- `Provision.Completed`: the tenant is **active**, and the saga publishes `TenantActivated`.
- `Provision.Faulted`: a step failed. Courier has already **undone** the steps that compensate, last first (the admin user, then the database, then the tenant). The saga publishes `TenantProvisioningFailed` and waits; an operator can retry, which enters Provisioning again and runs the whole slip once more.

A cancelled tenant enters **Deprovisioning**, which starts the `Deprovision` slip: export the data, drop the database, delete the tenant. When it completes the saga ends. When it fails nothing is undone (a dropped database stays dropped), so the saga opens a support ticket and waits for someone to confirm the clean-up.

## What it shows

- **Routing slips started by a state:** `WhenEnter(Provisioning, … ThenAsync(…))` builds the itinerary with `RoutingSlipBuilder` and executes it. A `// Routing slip: Provision` comment names the slip, and a `// compensates` comment marks each step Courier can undo.
- **The outcomes of a slip:** C# has one `RoutingSlipCompleted` and one `RoutingSlipFaulted`, correlated by the tracking number, which the saga sets to its own `CorrelationId`. The state the saga is in tells the two slips apart, so the diagram shows them as `Provision.Completed` and `Deprovision.Faulted`.
- A retry that runs a slip again by entering its state again.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`TenantProvisioningStateMachine.cs`](TenantProvisioningStateMachine.cs). The diagram is [`tenant-provisioning.saga.yaml`](tenant-provisioning.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`tenant-provisioning.docs.md`](tenant-provisioning.docs.md).
