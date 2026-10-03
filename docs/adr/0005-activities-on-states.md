# ADR 0005: Activities belong to states

- Status: accepted
- Date: 2026-10-03
- Issues: #134, #135
- Amends: [ADR 0003](0003-auto-layout-commands-events.md) (decision 1: activities on transitions)

## Context

ADR 0003 modelled a saga like MassTransit's behavior chain: a transition has the triggering `event` and
an ordered list of `activities` (send a command, publish an event) that run before the saga enters the
target state.

In use this mixed two concepts on the same element. A transition both _reacts_ (to an event) and _acts_
(sends commands), so the label grew with every activity and a command appeared once per incoming
transition, even when every path into a state did the same thing.

MassTransit has a direct way to say "this state does that on entry":

```csharp
WhenEnter(ChargingPayment, binder => binder
    .Send(new ChargePayment(..))
    .Publish(new PaymentRequested(..)));
```

## Decision

1. **States do things; transitions react.**
   - A node has `activities`: an ordered list of `command:` (send) and `event:` (publish) entries that run
     when the saga enters it. This maps to `WhenEnter`.
   - An edge has only `event`, `eventSource` and `kind`. The label on a transition shows the event and
     where it comes from, nothing else.
2. **Which nodes.** States and the final state have activities (a final state may publish
   `OrderCompleted` on entry). The initial state has none: no transition enters it.
3. **Internal or external** is derived from the states: an event is internal when some state publishes
   it, external otherwise. (Unchanged rule, new place to look.)
4. **Format version 3.** `activities` moves from `edges[]` to `nodes[]`; edges with `activities` are
   rejected in version 3. The reader still accepts versions 1 and 2:
   - version 2 transition activities move onto the target state, in edge order, de-duplicated;
   - the app shows what moved and treats the file as unsaved until it is saved as version 3.
5. **Final states with activities are drawn as cards**, not pills, so their chips have room. The
   initial state and final states without activities stay compact.

## Consequences

- Diagrams are easier to read: each command or event appears once, on the state that produces it, and
  transitions stay small.
- Code mapping is direct. The generator (#93) emits `WhenEnter(State, ...)` for activities; the importer
  (#83) turns `When(E).Send(...).TransitionTo(S)` into activities of `S`.
- **Information is lost when two transitions into one state do different things** (e.g. `PaymentFailed`
  sends `ReleaseStock` and `Timeout` sends nothing, both into `Cancelled`). The migration merges them
  onto the state. The importer reports such cases as warnings instead of failing, so the diagram stays a
  simplification of the code, never a silent change.
- A transition that must send something only when taken from one specific state needs an extra state to
  express it. That is a conscious limit of the documentation model; guards (#146) cover the rest.
