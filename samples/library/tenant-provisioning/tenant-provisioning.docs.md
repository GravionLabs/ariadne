# Tenant Provisioning

## Diagram

```mermaid
---
title: "Tenant Provisioning"
---
stateDiagram-v2
  accTitle: Tenant Provisioning
  accDescr: 7 states and 8 transitions, from Initial to Final.
  direction TB
  [*] --> Provisioning : TenantRequested
  Provisioning --> Active : Provision.Completed / Publish TenantActivated
  Provisioning --> ProvisioningFailed : Provision.Faulted / Publish TenantProvisioningFailed
  ProvisioningFailed --> Provisioning : ProvisioningRetried
  Active --> Deprovisioning : TenantCancelled
  Deprovisioning --> Final : Deprovision.Completed
  Deprovisioning --> NeedsAttention : Deprovision.Faulted / Send OpenSupportTicket
  NeedsAttention --> Final : CleanupConfirmed
  Final --> [*]
  note right of Provisioning : Routing slip Provision: CreateTenant → CreateDatabase → CreateAdminUser → SendWelcomeMail (undo: CreateAdminUser, CreateDatabase, CreateTenant)
  note right of Deprovisioning : Routing slip Deprovision: ExportData → DropDatabase → DeleteTenant
```

## States

| State | Type | Description | Activities | Routing slips | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |  |
| Provisioning | Decision |  |  | Provision |  |  |  |
| Active | State |  | Publish TenantActivated |  |  |  |  |
| ProvisioningFailed | State |  | Publish TenantProvisioningFailed |  |  |  |  |
| Deprovisioning | Decision |  |  | Deprovision |  |  |  |
| NeedsAttention | State |  | Send OpenSupportTicket |  |  |  |  |
| Final | Final |  |  |  |  |  |  |

## Routing slips

### Provision

Started when the saga enters “Provisioning”. It ends as Provision.Completed when every activity ran, or as Provision.Faulted when one faulted.

1. CreateTenant (compensates)
2. CreateDatabase (compensates)
3. CreateAdminUser (compensates)
4. SendWelcomeMail

On a fault, undone in this order: CreateAdminUser → CreateDatabase → CreateTenant.

### Deprovision

Started when the saga enters “Deprovisioning”. It ends as Deprovision.Completed when every activity ran, or as Deprovision.Faulted when one faulted.

1. ExportData
2. DropDatabase
3. DeleteTenant

## Transitions

| From | Event | Source | To | Kind |
| --- | --- | --- | --- | --- |
| Initial | TenantRequested | external | Provisioning | Forward |
| Provisioning | Provision.Completed | routing slip | Active | Forward |
| Provisioning | Provision.Faulted | routing slip | ProvisioningFailed | Forward |
| ProvisioningFailed | ProvisioningRetried | external | Provisioning | Forward |
| Active | TenantCancelled | external | Deprovisioning | Forward |
| Deprovisioning | Deprovision.Completed | routing slip | Final | Forward |
| Deprovisioning | Deprovision.Faulted | routing slip | NeedsAttention | Forward |
| NeedsAttention | CleanupConfirmed | external | Final | Forward |

## Commands

| Command | Sent in |
| --- | --- |
| OpenSupportTicket | NeedsAttention |

## Events

| Event | Origin | Published in | Triggers |
| --- | --- | --- | --- |
| CleanupConfirmed | External |  | NeedsAttention → Final |
| Deprovision.Completed | Routing slip completed |  | Deprovisioning → Final |
| Deprovision.Faulted | Routing slip faulted |  | Deprovisioning → NeedsAttention |
| Provision.Completed | Routing slip completed |  | Provisioning → Active |
| Provision.Faulted | Routing slip faulted |  | Provisioning → ProvisioningFailed |
| ProvisioningRetried | External |  | ProvisioningFailed → Provisioning |
| TenantActivated | Internal | Active |  |
| TenantCancelled | External |  | Active → Deprovisioning |
| TenantProvisioningFailed | Internal | ProvisioningFailed |  |
| TenantRequested | External |  | Initial → Provisioning |
