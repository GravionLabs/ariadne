# ADR 0007: Importing C# saga state machines with tree-sitter, in TypeScript

- Status: accepted
- Date: 2026-10-03
- Issues: #78, #83, #84, #85, #86
- Builds on: [ADR 0005](0005-activities-on-states.md), [ADR 0006](0006-typescript-monorepo.md)

## Context

Teams already have MassTransit saga state machines (`MassTransitStateMachine<T>`). Ariadne should build
a diagram from them, so the sagas can be documented and diagram and code can be compared. The earlier
plan was a .NET backend with Roslyn. Since the repository is TypeScript only (ADR 0006), the import has
to run in TypeScript too: in the browser (the source code must not leave the machine), in the CLI and CI,
and in the VS Code extension.

## Options

|                     | tree-sitter-c-sharp (WASM), chosen   | Roslyn (.NET)         | MassTransit `GetGraph()`        |
| ------------------- | ------------------------------------ | --------------------- | ------------------------------- |
| Runs in             | browser, Node, VS Code               | a .NET backend or CLI | .NET, loads the user's assembly |
| Runs user code      | no                                   | no                    | **yes**                         |
| Understands         | syntax, and what the given files say | full semantics        | states, events, transitions     |
| Backend for the web | **none**                             | yes                   | yes                             |

## Decision

1. **Parse with `web-tree-sitter` and the grammar `tree-sitter-c-sharp`** (both npm packages; the
   grammar ships `tree-sitter-c_sharp.wasm`). The importer is `@ariadne/masstransit`:
   `importSagas(files, parser)` returns the sagas found (a diagram each, plus where every state and
   transition is in the code) and the warnings (path, line, message). It never throws for a construct it
   does not understand.
2. **What is read, syntactically**
   - Classes whose base list has `MassTransitStateMachine<T>` (also qualified). Partial classes are
     merged across the given files, in any order; a class with the same name in two namespaces is one.
   - `State` and `Event<T>` properties and fields; `InstanceState(x => x.Prop)`; the correlation written
     in `Event(() => E, x => x.CorrelateById(…) / CorrelateBy(…))`, kept as that call's text.
   - In the constructor: `Initially`, `During(s1, s2, …)`, `DuringAny`, `WhenEnter(S, b => …)`.
     `When(E)` (and `When(E, filter)`, the filter becomes the **guard**) followed by `TransitionTo(S)` or
     `Finalize()`. A handler without either keeps the saga in its state: a transition to itself.
     `Ignore(E)` becomes an ignored event of the state.
   - `Send`/`SendAsync` become `command:` and `Publish`/`PublishAsync` `event:` activities of the state the
     transition leads into (or of the `WhenEnter` state), named by the message created: `new T(…)`,
     `Init<T>(…)` or `Publish<T>(…)`. Different activities on transitions into one state are all kept,
     without repeats, with a warning (the diagram simplifies the code, ADR 0005).
   - Calls to **methods of the same class** are followed: a helper that returns a whole handler
     (`AssignmentHandler()`), and one that wraps a handler (`Notify(When(E))`, the parameter standing for
     what is passed in). Two levels deep at most.
3. **What becomes a warning, with its line**: `Then` and other calls that run code (said once per saga),
   `If`/`IfElse`/`Schedule`/`Unschedule`/`Request`/`Switch`, `WhenLeave`/`Finally`/`CompositeEvent`,
   activities on the way into the final state (nothing happens in a final state), a handler that stays in
   or returns to the initial state, `DuringAny` without a transition, a state that is used but not declared
   in the given files, a message type that could not be read. The model has timers, requests and joins
   (#141), but the mapping of these constructs is left for a later issue.
4. **What cannot be found: a state machine through another base class.** `class S : Audited<T>` could
   be a MassTransit state machine, but nothing in the given files says so. The importer reports a
   warning on a generic base that is not `MassTransitStateMachine` when the constructor uses
   `Initially`/`During`, and asks for the file with the base class. Following bases across files that are
   given is a later step.
5. **Ids are stable**: `start-1`, `state-<kebab-name>`, `end-1`, `any-1` and `edge-1…` in source order,
   so importing again diffs cleanly. State names are the property names, as written in the code
   (`ReservingStock`); a state machine's name is its class name without `StateMachine`.
6. **Shipping the grammar.** The WebAssembly is loaded only when a C# file is about to be read:
   - the grammar is 5.35 MB (317 kB gzipped) and the tree-sitter runtime 210 kB (83 kB gzipped);
   - `createCSharpParser({ grammar, runtime })` takes a URL, a path or bytes for each; the web app serves
     both as assets and loads them on first use, Node (`@ariadne/masstransit/node`, used by tests, the CLI
     and the extension) reads them from the installed packages;
   - the grammar package's native build is switched off (`allowBuilds`), only its `.wasm` is used.

## Measured

On the sample sagas of `samples/sagas/` (order, branching with outside events in later states, `WhenEnter`,
a partial class in two files with helper methods, and a base class that cannot be resolved), in Node:

- the output of every sample is a valid `*.saga.yaml` that the editor opens, with no error finding; the
  expected files sit next to the samples and are golden tests;
- start-up (runtime + grammar) 23 ms; a 60-line saga parses in 6 ms; 2,600 lines in 50 ms;
- the browser is checked when the import is added to the web app (#90); this ADR is updated if loading
  differs there.

## Consequences

- No backend, and no source code leaves the machine. The earlier idea of a self-hosted import service
  (#104) is gone.
- Only syntax is read. Anything that needs types, other assemblies or extension methods is a warning
  or, as with an unknown base class, not found. The importer says what it left out instead of guessing.
- `correlation` in the diagram holds the `CorrelateById(…)` / `CorrelateBy(…)` call as written, so the
  generator (#94) can write it back; `CorrelationId` means the default.
- Events no state publishes come out as outside events without a source: where an event comes from is
  not in the code.
