# ADR 0013: Generating C# from a diagram, and checking diagram against code

- Status: accepted
- Date: 2026-10-03
- Issues: #78, #93, #94, #98, #100
- Builds on: [ADR 0005](0005-activities-on-states.md), [ADR 0007](0007-csharp-import.md)

## Context

The importer ([ADR 0007](0007-csharp-import.md)) turns code into a diagram. The other direction starts a
saga: draw it, then get a state machine, a saga instance and message contracts to fill in. Both
directions together let a team notice when the diagram and the code drift apart.

## Decision

- **`generateSaga(diagram)` in `@ariadne/masstransit`** returns `{ files, warnings }`: the state machine
  (`Initially`, `During`, `DuringAny`, `WhenEnter`, `Finalize`, `SetCompletedWhenFinalized`), the saga
  instance and `Contracts.cs` with a record per message. It is plain string building, with no template
  engine and no dependency, so it runs in the browser, the CLI and tests, and it is deterministic (no dates,
  declaration order from the diagram).
- **It does not guess.** Message properties and guards are `TODO` comments, so that searching for `TODO`
  finds the work left. A guard is written as `context => true /* TODO guard: … */`, because guards are free
  text. Properties that a correlation expression reads (`context.Message.OrderId`, `saga.BookingId`) are
  declared, since the code would not compile without them.
- **What cannot be generated yet is said**, not dropped silently: joins, request outcomes
  (`Name.Completed`), requests and timeouts of a state, transitions without an event. Names that clash after
  being turned into identifiers get a number, with a warning.
- **Activities use `WhenEnter(State, binder => binder.Send(…).Publish(…))`**, the form the importer reads
  back into the state, so the round trip is exact.
- **`diffDiagrams(diagram, fromCode)`** compares states, transitions (source, target, event), activities,
  ignored events and the message type and correlation of events. Names are compared as the identifiers
  code would have. Guards (free text), layout, colors and notes are not compared.
- **Where it is used**: the "Generate C#…" dialog in the editor (copy a file, or save all of them into a
  folder where the browser offers a directory picker, otherwise as one zip), and the CLI:
  `ariadne generate`, `ariadne import` and `ariadne diff` (exit code 1 on drift, for a consumer's CI).

## Checked

- Snapshot tests of the generated files; a golden round trip for every sample (generate → import → no
  difference) in `pnpm test`.
- A CI job (`scripts/compile-generated.sh`, .NET SDK 8 and MassTransit 8) compiles the C# generated for
  every sample and example diagram. It caught the first bug at once: contracts without the properties that
  correlation expressions read.

## Consequences

- The generated code is a starting point, not something to regenerate over edited code: the dialog and the
  CLI write to a place the developer chooses and never overwrite a project.
- `ariadne import` and `ariadne diff` read the grammar from two `.wasm` files next to `ariadne.mjs`
  (`apps/cli/dist`), which the build copies. The bundle must be shipped with them.
- Guards stay free text in the diagram. A later step could write them as real conditions if the format gets a
  typed form of them.
