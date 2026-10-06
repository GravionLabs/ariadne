# Modelling sagas

A diagram is a saga **state machine**, the way MassTransit writes it. States do things; transitions react to events.

| In the diagram                           | In MassTransit                                     |
| ---------------------------------------- | -------------------------------------------------- |
| Initial state (green), final state (red) | `Initial`, `Final`                                 |
| State                                    | `State`                                            |
| Transition with an event                 | `During(State, When(Event).TransitionTo(Next))`    |
| Activities of a state                    | `WhenEnter(State, b => b.Send(...).Publish(...))`  |
| Any state                                | `DuringAny(When(Event)...)`                        |
| Ignored events of a state                | `During(State, Ignore(Event))`                     |
| Requests and timeouts of a state         | `Request` and `Schedule`                           |
| Join                                     | `CompositeEvent`                                   |
| Compensation                             | the undo action for the work that led to the state |

**View mode:** the eye button in the toolbar hides the "+" buttons and the dotted lines that lead to them, to read a
diagram or take a screenshot. Nothing else changes (you can still select, use the inspector and the keyboard). It lasts
until you switch it off or close the editor: the editor always opens in edit mode. Exports never contain the "+"
buttons.

**Adding a state:** the "+" after a state (or on a transition) opens a picker; after you pick the type, the same
popover asks for the **event** of the new transition (with the suggestions of the inspector's Event field) and the
**name** of the new state. The event field has the focus; `Enter` adds everything as one undo step. `Esc`, or leaving
the fields empty, adds the state with the default name and no event. "To a new state" and "To a final state" in the
inspector ask the same way. On a transition A → B the event you give belongs to the transition from the new state to B;
the one into it keeps its own.

## States

A state has a name, an optional description and colour, and optionally:

- **Activities**, in order: _Send command_ (to exactly one consumer, named in the imperative: `ChargePayment`) or
  _Publish event_ (to any subscribers, named in the past tense: `OrderAccepted`). The inspector hints when a name
  doesn't follow that convention.
- **Requests** (`ValidateAddress`): the reply arrives as `ValidateAddress.Completed`, `.Faulted` or
  `.TimeoutExpired`; draw a transition for each outcome you handle.
- **Routing slips** (`Provision`): a MassTransit Courier itinerary the state starts when it is entered, its
  activities in order. Mark an activity **compensates** when Courier can undo it; on a fault the inspector shows the
  order they are undone in (last first). The slip ends as `Provision.Completed` or `Provision.Faulted`; draw a
  transition from the same state for each outcome you handle. A state waits for the outcomes of one slip only: C#
  cannot tell two apart.
- **Timeouts**: schedule one when the state is entered (`PaymentTimeout`, `30s`) or cancel it. A transition on the
  timeout's name is the timeout path.
- **Ignored events**, **retry** and **timeout** notes, and a **compensation** (name and description).

Only plain states can have these; the initial and final states cannot.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/guide/state-activities-dark.png">
  <img alt="The inspector of the state “Charging payment”: its name and description, the command it sends, and the timeout it schedules" src="../images/guide/state-activities-light.png">
</picture>

## Transitions

A transition says: while the saga is in the source state, this **event** moves it to the target. Several transitions
from one state make a **decision**. Give transitions of the same event different **guards** (`amount > 100`) to
branch on a condition.

A transition back to the same state is a loop (a retry). A **compensation** transition is drawn differently and is not
laid out; use it for the path back after a failure.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/guide/external-event-dark.png">
  <img alt="The transition “PaymentCharged” selected: the inspector shows its event and where it comes from, the Payment service, so the diagram says that it is an external event" src="../images/guide/external-event-light.png">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/guide/compensation-dark.png">
  <img alt="The state “Reserving stock” selected, with its Recovery section open: the compensation “ReleaseStock” that undoes its work, and the transitions of the state" src="../images/guide/compensation-light.png">
</picture>

## Events: internal and external

An event is **internal** when some state publishes it, and **external** otherwise. Ariadne works that out; you only
set the **source** of an external event (`Payment service`) so the diagram says where it comes from. External events
can arrive in any state, not only the first. Other kinds are recognised too: timeouts, replies, faults, the outcomes of a routing slip
and composite events of a join.

## Any state and join

- **Any** (the button in the toolbar) holds transitions that apply in every state, e.g. `OrderCancelled`. There is
  at most one.
- A **join** waits until the events of all its incoming transitions have arrived, then continues.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/guide/any-and-join-dark.png">
  <img alt="Part of the travel booking saga: the Any state, whose transitions apply in every state, and a join, drawn as a bar, that waits for several events before the saga goes on" src="../images/guide/any-and-join-light.png">
</picture>

## Code details

For the C# round trip, the **Code** section of the saga's details holds the state machine class, namespace, saga instance type
and state property; a transition's event can name its **message type** and **correlation**. All optional: the
generator derives names from the diagram. See [Import and generate C#](import-and-generate.md).

## Problems

The **Problems** menu lists what looks wrong: a state that cannot be reached or has no way to a final state, an
event that leaves a state twice without a guard, a transition without an event, an external event without a source. Select an entry to jump to it. `ariadne lint` reports the same in CI.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/guide/problems-menu-dark.png">
  <img alt="The Problems menu open over the order sample: one hint, that an event name is not in the past tense, with a button to jump to it" src="../images/guide/problems-menu-light.png">
</picture>
