# Import and generate C#

Ariadne converts in both directions and can check that the two still agree. Everything runs in your browser (or on
your machine, for the command line): source code is never sent anywhere.

## Import from C#

**Import C#…** takes one or more `.cs` files, finds the classes derived from `MassTransitStateMachine<T>` and shows
what it found. Pick a saga and choose **Open as new diagram**.

What is read: `Initially`, `During`, `DuringAny` and `WhenEnter`; `When(Event)` with an optional filter (shown as a
guard); `TransitionTo`, `Finalize` and `Ignore`; `Send` and `Publish` (shown as activities of the target state);
helper methods of the same class; partial classes spread over several files; `Event(() => E, x => x.CorrelateById(...))`.

What is not drawn is listed as a **warning with file and line**: code that runs in `Then(...)`, `Request`,
`Schedule`, `If`, or a base class that cannot be resolved. The diagram is a view of the structure, not of every
line of code.

The result opens as a new, unsaved diagram. Import never changes your code.

## Generate C#

**Generate C#…** writes a MassTransit state machine, a saga instance and the message contracts. The dialog shows
each file; **Copy file** copies one, **Save all…** writes them into a folder you choose (or one zip, in browsers
without a folder picker).

The generated code is a starting point:

- search for `TODO`: the properties of the messages, and every guard, are left for you;
- joins, requests and per-state timeouts are not generated yet and are listed in the dialog;
- names are turned into C# identifiers (`Charging payment` → `ChargingPayment`), and a clash gets a number.

Save generated files where you want them; Ariadne never overwrites a project.

## Command line

```sh
ariadne generate order.saga.yaml -o src/Orders       # diagram -> C#
ariadne import src/Orders/*.cs -o docs               # C# -> diagram
ariadne diff docs/order.saga.yaml src/Orders/*.cs    # exit code 1 when they differ
```

`diff` lists the states, transitions, sent and published messages, ignored events, and the message type and
correlation of events that exist only on one side. Names are compared as C# identifiers; guards, layout, colours and
descriptions are not compared. Put `ariadne diff` in your CI to notice when the diagram and the code drift apart.

## Why it round-trips

Generating C# from a diagram and importing it again gives the same diagram (the tests check this for every sample).
A guard is the exception: it is free text in the diagram and a `TODO` condition in the code.
