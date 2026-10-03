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

## States

A state has a name, an optional description and colour, and optionally:

- **Activities**, in order: _Send command_ (to exactly one consumer, named in the imperative: `ChargePayment`) or
  _Publish event_ (to any subscribers, named in the past tense: `OrderAccepted`). The inspector hints when a name
  doesn't follow that convention.
- **Requests** (`ValidateAddress`): the reply arrives as `ValidateAddress.Completed`, `.Faulted` or
  `.TimeoutExpired`; draw a transition for each outcome you handle.
- **Timeouts**: schedule one when the state is entered (`PaymentTimeout`, `30s`) or cancel it. A transition on the
  timeout's name is the timeout path.
- **Ignored events**, **retry** and **timeout** notes, and a **compensation** (name and description).

Only plain states can have these; the initial and final states cannot.

## Transitions

A transition says: while the saga is in the source state, this **event** moves it to the target. Several transitions
from one state make a **decision**. Give transitions of the same event different **guards** (`amount > 100`) to
branch on a condition.

A transition back to the same state is a loop (a retry). A **compensation** transition is drawn differently and is not
laid out; use it for the path back after a failure.

## Events: internal and external

An event is **internal** when some state publishes it, and **external** otherwise. Ariadne works that out; you only
set the **source** of an external event (`Payment service`) so the diagram says where it comes from. External events
can arrive in any state, not only the first. Other kinds are recognised too: timeouts, replies, faults and composite
events of a join.

## Any state and join

- **Any** (the button in the toolbar) holds transitions that apply in every state, e.g. `OrderCancelled`. There is
  at most one.
- A **join** waits until the events of all its incoming transitions have arrived, then continues.

## Code details

For the C# round trip, the **Code** section of the saga's details holds the state machine class, namespace, saga instance type
and state property; a transition's event can name its **message type** and **correlation**. All optional: the
generator derives names from the diagram. See [Import and generate C#](import-and-generate.md).

## Problems

The **Problems** menu lists what looks wrong: a state that cannot be reached or has no way to a final state, an
event that leaves a state twice without a guard, a transition without an event, an external event without a source. Select an entry to jump to it. `ariadne lint` reports the same in CI.
