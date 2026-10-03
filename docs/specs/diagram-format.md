# Diagram file format (version 3)

Ariadne stores one diagram per YAML file, named `*.saga.yaml` (older `.yaml` / `.yml` files can still be opened). Files are meant to be committed to git.
The format is designed so that an unchanged diagram is written byte-for-byte identically. Layout is
computed by the editor, so files hold the graph only: no positions, and a diff only shows what
changed in the saga.

A diagram is a saga **state machine**, in the sense of MassTransit sagas:

- **Nodes** are states. Entering a state runs its **activities** (send commands, publish events),
  like `WhenEnter(State, binder => binder.Send(...).Publish(...))`.
- **Edges** are transitions. While the saga is in the source state, the transition's event moves it on
  to the target state.

States do things; transitions only react to events. A state left by several transitions is a decision:
which way the saga goes depends on the event it receives.

## Example

```yaml
version: 3
name: Order Saga
description: Takes an order from the shop to delivery.
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
  - id: state-1
    type: state
    name: Charging payment
    description: Waits for the payment provider
    activities:
      - command: ChargePayment
    retry: 3 attempts, exponential backoff
    timeout: 30s
    compensation:
      name: RefundPayment
  - id: state-2
    type: state
    name: Shipping
    activities:
      - command: ShipOrder
      - event: OrderAccepted
  - id: end-1
    type: end
    name: Completed
  - id: end-2
    type: end
    name: Cancelled
edges:
  - id: edge-1
    source: start-1
    target: state-1
    kind: forward
    event: OrderSubmitted
    eventSource: Shop API
  - id: edge-2
    source: state-1
    target: state-2
    kind: forward
    event: PaymentCharged
  - id: edge-4
    source: state-2
    target: end-1
    kind: forward
    event: OrderShipped
  - id: edge-3
    source: state-1
    target: end-2
    kind: forward
    event: PaymentFailed
```

## Fields

| Field         | Type                         | Required | Notes                                                                                                                                                   |
| ------------- | ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `version`     | integer                      | yes      | `3` (files with `1` or `2` are still read, see below).                                                                                                  |
| `name`        | string                       | no       | Title of the saga, e.g. `Order Saga`. Surrounding whitespace is trimmed; empty means unset. Exports use it as the title and fall back to the file name. |
| `description` | string                       | no       | What the saga does; trimmed, empty means unset. Shown under the title in exports.                                                                       |
| `direction`   | `top-bottom` \| `left-right` | no       | Layout direction. Defaults to `top-bottom`.                                                                                                             |
| `nodes`       | list                         | no       | Defaults to empty.                                                                                                                                      |
| `edges`       | list                         | no       | Defaults to empty. Every `source`/`target` must be a node id.                                                                                           |

### Node (state)

| Field          | Type                                                                                           | Required | Notes                                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | string                                                                                         | yes      | Unique within the file, e.g. `state-3`.                                                                                                                                                                                                                                   |
| `type`         | `start` \| `state` \| `end` \| `any`                                                           | yes      | Initial state (no incoming transitions), state, final state (no outgoing), or the one `any` node: transitions leaving it apply in every state (nothing enters it).                                                                                                        |
| `name`         | string                                                                                         | yes      | Label shown on the canvas.                                                                                                                                                                                                                                                |
| `description`  | string                                                                                         | no       | Documentation only.                                                                                                                                                                                                                                                       |
| `requests`     | list of requests                                                                               | no       | Requests the state makes on entry (`request: <Name>`, optional `timeout: 30s`). The answers are the events `<Name>.Completed`, `<Name>.Faulted` and `<Name>.TimeoutExpired`: transitions on them are drawn with a reply, fault or clock icon. Only on `state` nodes.      |
| `timers`       | list of timers                                                                                 | no       | Timeouts the state schedules (`schedule: <Name>`, optional `delay: 30s`) or cancels (`unschedule: <Name>`) on entry, in order. Only on `state` nodes. A transition whose `event` is the name of a scheduled timeout is the timeout path: drawn dotted amber with a clock. |
| `ignores`      | list of strings                                                                                | no       | Events the state receives and drops (`Ignore(E)`). Only on `state` nodes.                                                                                                                                                                                                 |
| `activities`   | list of activities                                                                             | no       | What the saga does on entering this state, in order. Only on `state` nodes: nothing runs in the initial or the final state.                                                                                                                                               |
| `color`        | `red` \| `orange` \| `amber` \| `green` \| `teal` \| `blue` \| `purple` \| `pink` \| `#rrggbb` | no       | Accent color at the top of the card: a palette name or a custom hex value. Defaults to the color of the node's type.                                                                                                                                                      |
| `retry`        | string                                                                                         | no       | Free text, e.g. `3 attempts`. Documentation only.                                                                                                                                                                                                                         |
| `timeout`      | string                                                                                         | no       | Free text, e.g. `30s`. Documentation only.                                                                                                                                                                                                                                |
| `compensation` | `{ name: string, description?: string }`                                                       | no       | Undo action for the work done to reach this state.                                                                                                                                                                                                                        |

### Edge (transition)

| Field         | Type                        | Required | Notes                                                                                                      |
| ------------- | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `id`          | string                      | yes      | e.g. `edge-4`.                                                                                             |
| `source`      | string                      | yes      | Node id: the state the saga is in.                                                                         |
| `target`      | string                      | yes      | Node id: the state the transition enters.                                                                  |
| `kind`        | `forward` \| `compensation` | no       | Defaults to `forward`. Compensation transitions are not laid out.                                          |
| `event`       | string                      | no       | The event that triggers the transition, e.g. `PaymentCharged`.                                             |
| `eventSource` | string                      | no       | Where an external event comes from, e.g. `Shop API`.                                                       |
| `guard`       | string                      | no       | Condition for taking the transition, e.g. `amount > 100`. Needs an `event`. Free text, documentation only. |

An event a transition reacts to is **internal** when some state of the same diagram publishes it
(an `event:` activity), and **external** otherwise. External events can arrive in any state, not only
the initial one. `eventSource` names the system they come from. Ariadne derives internal or external
from the diagram and does not store it.

A transition has no `activities` of its own: a file that gives one to an edge is rejected.

An **activity** is a mapping with exactly one key, the kind of message, following the
[MassTransit conventions](https://masstransit.massient.com/concepts/messages):

- `command: <Name>`: **send** an instruction to exactly one consumer. Named verb–noun in the
  imperative, e.g. `SubmitOrder`, `ChargePayment`.
- `event: <Name>`: **publish** a fact to any number of subscribers. Named noun–verb in the past tense,
  e.g. `OrderSubmitted`, `PaymentCharged`.

## MassTransit mapping

How the constructs relate to a MassTransit `MassTransitStateMachine<T>`. The importer (#83) and the
generator (#93) follow this table.

| Diagram                                                        | MassTransit                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `requests` `request: R`, `timeout: D`                          | `Request(() => R, x => x.RequestId, r => r.Timeout = D)`, then `.Request(R, ctx => new RMsg(..))` on entry                                                   |
| transition on `R.Completed` / `R.Faulted` / `R.TimeoutExpired` | `When(R.Completed)` / `When(R.Faulted)` / `When(R.TimeoutExpired)`                                                                                           |
| `timers` `schedule: T`, `delay: D`                             | `Schedule(() => T, x => x.TimeoutTokenId, s => { s.Delay = D; s.Received = e => e.CorrelateById(...); })`, then `.Schedule(T, ctx => new TMsg(..))` on entry |
| `timers` `unschedule: T`                                       | `.Unschedule(T)`                                                                                                                                             |
| transition on a scheduled timeout's name                       | `When(T.Received)`                                                                                                                                           |
| `ignores` of a state                                           | `During(State, Ignore(E))`                                                                                                                                   |
| transitions leaving the `any` node                             | `DuringAny(When(E).TransitionTo(S))`                                                                                                                         |
| transition with `guard`                                        | `When(E).If(ctx => <guard>, then => then.TransitionTo(A)).TransitionTo(B)`                                                                                   |
| transitions on one event, other guards                         | `When(E).IfElse(ctx => <guard>, then => then.TransitionTo(A), else => else.TransitionTo(B))`                                                                 |

## Version 1

Version 1 files are read without changes to their meaning:

- Node `position` and edge `sourcePort`/`targetPort` are accepted and ignored.
- Nodes of type `step` and `decision` become `state`.
- `direction` defaults to `top-bottom`.

Saving writes version 3.

## Version 2

Version 2 wrote activities on transitions. They are read and **moved onto the state each transition
leads into** (see [ADR 0005](../adr/0005-activities-on-states.md)):

- in edge order, appended after the state's own activities, without duplicates;
- a transition into the initial or a final state cannot keep its activities, since nothing runs in
  those states: they are dropped;
- the app tells the user which states received activities and which were dropped, and treats the
  file as unsaved until it is saved as version 3.

Everything else is unchanged.

## Determinism

The writer (`src/app/model/diagram-yaml.ts`) guarantees stable output:

- keys are always written in the order listed above (`version`, `name`, `description`, `direction`, `nodes`, `edges`);
- nodes, edges and activities keep their order in the diagram (new elements are appended);
- optional fields that are not set (or empty) are omitted;
- lines are never wrapped.

## Errors

Invalid files are rejected as a whole, and the current diagram is left unchanged. The error message
names the offending path. For example:

- `nodes[2].type must be one of start, end, state`
- `nodes[1].activities[0] must be "command: <Name>" or "event: <Name>"`
- `nodes[2].activities is only allowed on states, not on the final state`
- `nodes[1].ignores is only allowed on states`
- `nodes[1].requests[0] must be "request: <Name>"`
- `nodes[1].timers[0] must be "schedule: <Name>" or "unschedule: <Name>"`
- `There can be only one node of type "any"`
- `edges[0].activities is not allowed: activities belong to states (nodes[].activities)`
- `edges[0].target "state-9" is not a node`
