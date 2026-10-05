# Ariadne user guide

Ariadne draws MassTransit saga state machines, keeps them in git as small YAML files, and converts between the
diagram and C#. It documents a saga; it never runs one.

1. [Getting started](getting-started.md): open the editor, load a sample, save a file.
2. [Modelling sagas](modelling.md): states, transitions, events, activities, external events, compensation.
3. [Import and generate C#](import-and-generate.md): from code to a diagram, from a diagram to code, and checking
   that they still agree.
4. [Exports](exports.md): images, Mermaid and a Markdown page.
5. [Keyboard shortcuts](shortcuts.md).
6. [Ariadne in VS Code](vscode.md): install the extension from a release and work next to the code.
7. [Show a saga in your own app](viewer.md): the `<ariadne-saga>` viewer for web and Angular apps.
8. [Accessibility](accessibility.md): what is checked, what is not, and what is known not to work.
9. [Coding agents](agents.md): let an AI coding agent check, draw and convert sagas with a skill.

Operators: [self-hosting](../self-hosting.md). The file format: [diagram-format.md](../specs/diagram-format.md).

## Samples

**The tour:** three small sagas, one for each thing Ariadne draws.

| Sample                                                 | Shows                                                            | C#                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| [Order saga](../examples/order.saga.yaml)              | Stock and payment, a retried payment with a timeout              | [generated](../../samples/generated/order)            |
| [Booking saga](../../samples/sagas/booking)            | Branches on events from outside; the diagram is read from the C# | [BookingStateMachine.cs](../../samples/sagas/booking) |
| [Travel booking](../examples/travel-booking.saga.yaml) | Requests, a join, timeouts, compensation                         | [generated](../../samples/generated/travel-booking)   |

**The library:** real-world sagas, each with hand-written MassTransit C#, the diagram Ariadne reads from it, the C# it
generates back, and a documentation page. Read the story of each in its README.

| Sample                                                                     | Shows                                                                                                           | C#                                                                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Order fulfilment](../../samples/library/order-fulfilment/README.md)       | Stock, payment and shipping; stock given back when payment is declined; a late delivery; cancelling at any time | [hand-written](../../samples/library/order-fulfilment) · [generated](../../samples/library/order-fulfilment/generated)       |
| [Payment with retries](../../samples/library/payment-retries/README.md)    | A fraud check and manual review, retries after a wait up to three tries (guards), refunds, provider timeouts    | [hand-written](../../samples/library/payment-retries) · [generated](../../samples/library/payment-retries/generated)         |
| [Customer onboarding](../../samples/library/customer-onboarding/README.md) | A reminder after a day and giving up after a week, an outside identity check, abandoned and declined sign-ups   | [hand-written](../../samples/library/customer-onboarding) · [generated](../../samples/library/customer-onboarding/generated) |
| [Trip booking](../../samples/library/trip-booking/README.md)               | Flight, hotel and car one after the other; the bookings already made are cancelled in reverse order             | [hand-written](../../samples/library/trip-booking) · [generated](../../samples/library/trip-booking/generated)               |
| [Loan application](../../samples/library/loan-application/README.md)       | Three checks with a time limit each, a decision with three ways on, a manual review, an offer that lapses       | [hand-written](../../samples/library/loan-application) · [generated](../../samples/library/loan-application/generated)       |

In the app: **New** → "Start with a tour" or "Real-world sagas". To add one, see the
[sample library](../../samples/library/README.md).
