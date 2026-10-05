# ADR 0023: Routing slips are something a state starts, like a request

- Status: accepted
- Date: 2026-10-05
- Issues: #67, #275, #276, #397
- Builds on: [ADR 0003](0003-auto-layout-commands-events.md), [ADR 0005](0005-activities-on-states.md),
  [ADR 0013](0013-csharp-generation.md)

## Context

A MassTransit [routing slip](https://masstransit.massient.com/documentation/concepts/routing-slips) (Courier) is an
itinerary of activities that run one after the other. When one faults, the activities that already ran are
**compensated in reverse order**, from the logs they wrote. The common way to use one is from a saga
([monitor using a saga](https://masstransit.massient.com/guides/routing-slips/monitor-using-a-saga/)): a state
builds and executes the slip, subscribes to its outcome, and the saga moves on when `RoutingSlipCompleted` or
`RoutingSlipFaulted` comes back, correlated by the slip's `TrackingNumber`.

That is the shape of a **request**, which Ariadne already draws: something a state does on entry, whose outcomes
come back as events that transitions react to.

## Decision

- **A routing slip belongs to a state,** in `routingSlips` (only on `state` nodes, like `requests`): a name and its
  itinerary, the activities in order, each marked when it compensates. Entering the state starts the slip.
- **Its outcomes are events** named `<Name>.Completed` (every activity ran) and `<Name>.Faulted` (one faulted; the
  compensating ones that ran were undone). Transitions react to them like to any event, drawn with their own icons
  (a route for completed, the compensation icon in the fault colour for faulted).
- **The itinerary is a list, not a graph.** It is short and linear, and compensation runs in reverse order by
  definition: the card shows the slip, the inspector and the exports list the activities and the order in which
  they would be compensated. Nothing is drawn by hand.
- **No separate diagram kind** for now. One is only worth it for slips that run without a saga (started by a
  consumer or an API) or with complex itineraries (revisions, variables shared across many activities). The format
  leaves room for it.
- **In C#,** every slip reports with the same message types, so a saga has one pair of events, `RoutingSlipCompleted`
  and `RoutingSlipFaulted`, correlated by `TrackingNumber` (the slip is built with the saga's `CorrelationId` as its
  tracking number). The state tells the slips apart: `<Name>.Completed` is `When(RoutingSlipCompleted)` in the state
  that starts `<Name>`. Entering that state builds the slip (`RoutingSlipBuilder`, one `AddActivity` per activity,
  `AddSubscription` for `Completed | Faulted`) and executes it.
- **Checks:** a slip without activities is an error, so are two slips with one name or a slip named like a request
  of the same diagram (their outcome events would clash); an outcome no transition reacts to is a warning.

## Consequences

- The format gets a new optional field; files without it are unchanged (version 3).
- A state starts at most what its card can show; a saga with many slips per state is better split into states.
- Whether an activity compensates is documentation in the diagram: in Courier it is a property of the activity's
  type (`IActivity` rather than `IExecuteActivity`), not of the itinerary. The importer reads it from a
  `// compensates` comment at the end of the `AddActivity` line, which Ariadne writes when it generates the code,
  and reads every other activity as execute-only, without a warning (a warning on each activity of every slip would
  only be noise). Likewise, a slip's name is read from a `// Routing slip: Name` comment, else from the builder's
  variable.
