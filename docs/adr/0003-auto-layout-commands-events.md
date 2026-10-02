# ADR 0003: Saga state machines with auto-layout, commands and events

- Status: accepted
- Date: 2026-10-02

## Context

Building a saga with free placement was slow. Every node landed unconnected, every edge had to be
dragged between two of eight ports, and the result needed manual tidying. Nodes could not be renamed,
and transitions said nothing about why the saga moves on. The Foblex
[marketing-automation example](https://flow.foblex.com/examples/marketing-automation) shows a faster
way: the graph is laid out automatically, and nodes are added through "+" buttons after a node or on an
edge.

The sagas we document are MassTransit state machines:

```csharp
During(ChargingPayment,
    When(PaymentCharged).Send(new ShipOrder(..)).Publish(new OrderAccepted(..)).TransitionTo(Shipping),
    When(PaymentFailed).Publish(new OrderRejected(..)).TransitionTo(Cancelled));
```

While the saga is in a state, receiving an event triggers a transition. The transition sends commands
and/or publishes events, then enters the next state. A "decision" is simply a state that reacts to
several events. MassTransit
[distinguishes two kinds of messages](https://masstransit.massient.com/concepts/messages):

- **Commands** are sent to exactly one consumer and named imperatively: `SubmitOrder`.
- **Events** are published to any number of subscribers and named in the past tense: `OrderSubmitted`.

## Decision

1. **Nodes are states, edges are transitions.**
   - Nodes are `start` (initial), `state` or `end` (final).
   - A transition carries the `event` that triggers it and an ordered list of `activities`: a
     `command` to send or an `event` to publish.
   - An event the saga does not publish itself is external. It can arrive in any state, and its
     optional `eventSource` names where it comes from, e.g. `Shop API`. Internal or external is derived
     from the diagram, not stored, and shown on the label (teal "external" icon plus "from …").
   - States carry no messages, only notes: description, retry, timeout and compensation.
   - There is no decision type. A state with more than one outgoing transition is _drawn_ as a decision
     (diamond, violet).
2. **Layout is derived, not stored.**
   - `src/app/editor/diagram-layout.ts` lays out the forward transitions with
     [`@dagrejs/dagre`](https://github.com/dagrejs/dagre), top-bottom or left-right (`direction` in the
     file).
   - Transition labels (event, activities, "+") are dagre edge labels, so they get their own space
     between the states instead of overlapping at forks.
   - Compensation transitions point backwards, so they are drawn, with their label on the line, but
     left out of the layout.
   - The layout is a `computed` over the store, so every edit, undo and redo relayouts. Nodes cannot be
     dragged.
   - Sizes are computed, not measured (`nodeSize`, `labelSize`), so the layout is known before
     rendering.
3. **Building happens through "+".**
   - A dashed "+" slot follows every state that nothing follows yet, and every decision. It offers a
     new state or a final state.
   - The "+" on each transition inserts a state into it. The first half keeps the event and
     activities.
   - The inspector's "Add transition" makes a state branch.
   - Dragging out of a state onto another adds a transition between them. Dropping it on the canvas
     appends a state.
4. **A floating inspector edits the selection.**
   - For a state, it edits name, description, compensation and retry/timeout, and adds transitions.
   - For a transition, it edits the event, the activities (Send command / Publish event) and the kind.
   - It gives soft naming hints (imperative commands, past-tense events) and never blocks an edit.
   - Fields commit on `change` (blur or Enter), so each edit is one undo step.
   - It sits outside `<f-flow>`, so f-flow's Delete/Backspace handling never fires while typing.
5. **File format version 2.**
   - Version 2 drops `position`/`sourcePort`/`targetPort` and adds `direction`, plus edge `event`,
     `eventSource` and `activities`.
   - The reader still accepts version 1: it ignores positions and ports, and reads `step`/`decision`
     as `state`.

## Consequences

- Diagrams read like the saga code and always look tidy, and diffs only show graph changes. In
  exchange, manual placement is no longer possible.
- The eight-port connectors (introduced with the floating toolbox) are gone.
- The layout engine and the CDK overlay add about 150 kB to the initial bundle. The `initial` warning
  budget was raised from 700 kB to 900 kB.
- A new diagram starts with the initial state. An empty file shows an "Add the initial state" call to
  action.
