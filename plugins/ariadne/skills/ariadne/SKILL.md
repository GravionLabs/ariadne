---
name: ariadne
description: Work with MassTransit saga diagrams (*.saga.yaml) using the ariadne CLI. Use when the user wants to document, draw, review or check a MassTransit saga state machine (a class derived from MassTransitStateMachine<T>), turn its C# into a diagram or a diagram into C#, check that a diagram and its code still agree, lint a *.saga.yaml file, or export a saga as Mermaid, SVG, PNG or a Markdown page.
---

# Ariadne: saga diagrams for MassTransit

Ariadne keeps a MassTransit saga state machine as a small YAML file (`*.saga.yaml`) next to the code: states,
transitions on events, and what each state does on entry. Diagrams are documentation; nothing is executed. The
`ariadne` command checks them, converts them to and from C#, compares them with the code, and draws them.

## Before you start

Check that the command is there:

```sh
ariadne --version
```

If it is not, install it from the newest release (Node 22 or later), after asking the user:

```sh
npm install -g https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz
```

In a clone of the Ariadne repository itself, use `node apps/cli/dist/ariadne.mjs` (build it with
`pnpm --filter @ariadne/cli build`).

Exit codes, for every command: `0` all good, `1` findings (errors, differences, no saga found), `2` wrong usage
or a file that cannot be read or written. Treat `1` as a result to report, not as a crash.

## The commands

| Task                       | Command                                                                      |
| -------------------------- | ---------------------------------------------------------------------------- |
| Check a diagram            | `ariadne lint <file.saga.yaml…> [--format text\|json] [--max-warnings <n>]`  |
| C# → diagram               | `ariadne import <file.cs…> [-o <dir>]`                                       |
| Diagram → C#               | `ariadne generate <file.saga.yaml> [-o <dir>]`                               |
| Do code and diagram agree? | `ariadne diff <file.saga.yaml> <file.cs…> [--class <name>]`                  |
| Draw it                    | `ariadne export <file.saga.yaml> --format mermaid\|svg\|png\|md [-o <file>]` |

`ariadne --help` shows the same, with details.

### lint

Reports modelling mistakes, one per line: `file: severity: message [element] (rule)`. Severities are `error`
(the file cannot be used: fix it), `warning` (probably a mistake, e.g. `dead-end`: a state with no way to a final
state; `ambiguous-event`: one event leaves a state twice without a guard) and `info` (hints, e.g.
`naming-event`: events are past tense). Use `--format json` to read the findings in code: a list of
`{ file, invalid, findings: [{ severity, code, message, elementId, element }] }`, where `invalid` is the parse
error of a file that is not a diagram at all. Exit 1 when there are errors, or more warnings than
`--max-warnings`. After you write or change a diagram, lint it and fix what it reports before you finish.

### import

Reads `MassTransitStateMachine<T>` classes from C# files (pass all files of the saga, including partial classes
and the instance) and writes one `<ClassName>.saga.yaml` per saga. What the diagram cannot show is printed on
standard error with file and line, for example code in `.Then(...)`, `WhenLeave`, `Switch`, or anything sent
on the way into the final state. Those are not errors: tell the user what was left out. Exit 1 if no saga was
found.

### generate

Writes the state machine, the saga instance and the message contracts as C# (MassTransit 8). The code compiles,
but it is a starting point: message properties and guards are `TODO`s, and what the diagram cannot say (a
transition without an event, a compensation's undo action) is reported on standard error. Never overwrite the
user's existing saga code with generated files; generate into a new folder and compare, or ask.

### diff

Compares a diagram with the C# that implements it and lists missing and extra states, transitions, sent and
published messages, one per line, then the number of differences. Exit 1 when they differ. Use `--class` when
the files contain several state machines. It is a good CI step to keep a committed diagram honest.

### export

`mermaid` and `md` (a documentation page with the diagram, the states and the messages) go to standard output
unless `-o` is given; `svg` and `png` need `-o`. To **look at a diagram yourself**, export a PNG and open the
image:

```sh
ariadne export order.saga.yaml --format png -o /tmp/order.png
```

## Writing a diagram by hand

Follow the format exactly; the full reference is
<https://gravionlabs.github.io/ariadne/specs/diagram-format>, and the JSON Schema is
<https://raw.githubusercontent.com/GravionLabs/ariadne/main/docs/specs/saga.schema.json>.

```yaml
version: 3
name: Order saga
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
  - id: state-1
    type: state
    name: Charging payment
    activities:
      - command: ChargePayment
  - id: state-2
    type: state
    name: Shipping
    activities:
      - event: OrderAccepted
  - id: end-1
    type: end
    name: Completed
edges:
  - id: edge-1
    source: start-1
    target: state-1
    event: OrderSubmitted
    eventSource: Shop API
  - id: edge-2
    source: state-1
    target: state-2
    event: PaymentCharged
  - id: edge-3
    source: state-2
    target: end-1
    event: OrderShipped
```

The rules that matter most:

- Node `type` is `start`, `state`, `end`, `any` (transitions leaving it apply in every state) or `join` (waits
  until the events of all transitions into it have arrived; its `name` is the composite event).
- **Activities belong to states**, never to transitions: entering a state runs them (`WhenEnter`). Each is
  `command: Name` (send, imperative: `ChargePayment`) or `event: Name` (publish, past tense: `PaymentCharged`).
  Nothing runs in the initial or a final state.
- A transition has `source`, `target`, and normally an `event`; `guard` (free text) tells apart several
  transitions on one event; `eventSource` names where an external event comes from.
- Requests: `requests: [{ request: ValidateAddress, timeout: 30s }]` on a state; its answers are the events
  `ValidateAddress.Completed`, `.Faulted` and `.TimeoutExpired`. Timeouts:
  `timers: [{ schedule: PaymentTimeout, delay: 5m }]` on a state, and a transition on the event `PaymentTimeout`.
- Ids are unique; every `source`/`target` is a node id. There are no positions: the layout is computed.

## Typical jobs

- **Document an existing saga:** `ariadne import` its C# files into the docs folder, `ariadne lint` the result,
  report the import warnings, and `ariadne export --format md` (or `svg`) for a page. Commit the `*.saga.yaml`.
- **Design a saga from a description:** write the YAML, lint until it is clean (no errors, warnings explained),
  look at the PNG, then `ariadne generate` into a new folder if the user wants code.
- **Check that code and diagram agree:** `ariadne diff`; to keep it that way, add a CI step that runs
  `ariadne lint` and `ariadne diff` and fails on exit code 1.
- **Let the user edit visually:** the editor runs in the browser at <https://gravionlabs.github.io/ariadne/app/>
  (files stay on their machine) and in VS Code (the Ariadne extension).
