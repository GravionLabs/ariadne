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

Operators: [self-hosting](../self-hosting.md). The file format: [diagram-format.md](../specs/diagram-format.md).

## Samples

| Sample                                                 | Shows                                                            | C#                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------- |
| [Order saga](../examples/order.saga.yaml)              | Stock and payment, a retried payment with a timeout              | [generated](../../samples/generated/order)            |
| [Booking saga](../../samples/sagas/booking)            | Branches on events from outside; the diagram is read from the C# | [BookingStateMachine.cs](../../samples/sagas/booking) |
| [Travel booking](../examples/travel-booking.saga.yaml) | Requests, a join, timeouts, compensation                         | [generated](../../samples/generated/travel-booking)   |

In the app: **New** → "Or start from a sample".
