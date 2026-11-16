# ADR 0031: A .NET library in the repository that reads built MassTransit state machines

- Status: Proposed
- Date: 2026-11-16
- Issues: #505, #503, #504
- Amends: [ADR 0006](0006-typescript-monorepo.md), [ADR 0007](0007-csharp-import.md)
- Builds on: [ADR 0015](0015-versioning-and-releases.md), [ADR 0027](0027-release-branch.md), [ADR 0028](0028-json-second-representation.md)

## Context

ADR 0006 makes the repository TypeScript only. ADR 0007 reads C# saga state machines with tree-sitter and rejects a
.NET reader for three reasons: it needs a backend, it makes the source leave the machine, and `GetGraph()` on a
built machine loads and runs the user's assembly. The spike for #504 ([`masstransit-introspection.md`](../specs/masstransit-introspection.md))
shows what a **built** `MassTransitStateMachine<T>` gives that source does not: the real states, events and message
types (also for generic and partial machines, names built in code, and base classes the parser cannot resolve),
`Send`/`Publish`/`Request`/`Schedule` with their types, and `Catch`. It gives less than the source in one place: the
text of guards and of correlation expressions is a compiled delegate.

A library that lives in the user's own application (a package they reference, called from their code) answers the
three objections of ADR 0007 differently: see [Why this answers ADR 0007](#why-this-answers-adr-0007). It serves
the sagas as JSON ([ADR 0028](0028-json-second-representation.md)) to the viewer, and exports files for the CLI and
the editor. That is a second language, a second toolchain and a second package registry in a repository that has
one of each, so it needs its own record.

## Decision

### 1. Where the code lives: `dotnet/` in this repository

A folder `dotnet/` with its own solution (`dotnet/Ariadne.slnx`), `src/` and `tests/` below it, and its own
`Directory.Build.props` and `Directory.Packages.props` (central package management, locked restore). The pnpm
workspace does not include it (`pnpm-workspace.yaml` is unchanged) and nothing in `dotnet/` is built by `pnpm build`.

**Why this repository, and not one of its own**

- The contract with the TypeScript side is files: `docs/specs/saga.schema.json`, the format spec and the golden
  files. In one repository a change to the format, both readers and the goldens go through one pull request and one
  review; in two they drift, and the `PR checks` workflow cannot tell that a schema change broke the other side.
- One version and one release (ADR 0015, ADR 0027), one issue tracker with the Epic → Feature → PBI hierarchy, one
  set of rulesets and one supply-chain policy (ADR 0019).
- The repository already has a .NET job (`generated-csharp` compiles the C# the generator writes) and a dev
  container with the SDK.

**What it costs:** a second toolchain in CI and in the dev container, and a release that is no longer only
npm and a container image. The .NET jobs run only when `dotnet/`, the schema, the goldens or the samples change, so
TypeScript-only pull requests do not wait for them. If the library ever gets its own maintainers or release
rhythm, moving `dotnet/` into a repository of its own is cheap, because it only touches the repository through the
files of section 3.

### 2. Packages and dependencies

| Package id (and root namespace)              | Contains                                                                                                          | Depends on                                                         | Target frameworks   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| `GravionLabs.Ariadne.MassTransit`            | the reader of a built machine (visitor, probe), the model, validation, the JSON writer and reader                 | `MassTransit` (8.x), `System.Text.Json`                            | `netstandard2.0`    |
| `GravionLabs.Ariadne.MassTransit.Yaml`       | the YAML writer and reader                                                                                        | the core package, `YamlDotNet`                                     | `netstandard2.0`    |
| `GravionLabs.Ariadne.MassTransit.AspNetCore` | the endpoints (`MapAriadneSagas`) of ADR 0028: a list of sagas and one saga per resource                          | the core package, `Microsoft.AspNetCore.App` (framework reference) | `net8.0`, `net10.0` |
| `GravionLabs.Ariadne.Tool`                   | a .NET tool (`dotnet tool install`, command `ariadne-dotnet`): loads the assembly the user names and writes files | the core and the YAML package                                      | `net8.0`, `net10.0` |

- **The core has MassTransit and `System.Text.Json` only.** It is the package an application references to serve
  JSON; it brings no YAML parser, so an API that only serves the viewer carries nothing it does not use.
- **YAML is a package of its own**, because YamlDotNet is a dependency with its own release rhythm and its own
  supply-chain surface that the JSON path does not need (ADR 0028: producers need no YAML library). The tool
  references it, since the files people keep are `*.saga.yaml`.
- Package ids carry the `GravionLabs.` prefix of the organisation, and namespaces equal package ids, so a namespace
  tells which package a type comes from. `MassTransit` is in the id because the reader is MassTransit specific; a
  reader for another saga library would be a package of its own.
- **Frameworks.** The core and the YAML package target `netstandard2.0`, the lowest framework MassTransit 8.x
  ships and the one that reaches .NET Framework 4.7.2 and every current .NET. `System.Text.Json` comes as a package
  there. The ASP.NET Core package and the tool target the two supported LTS releases, 8 and 10 (9 is covered by
  8, it is a short-term release). The test projects run on the SDK that CI pins (10.0.x).
- **MassTransit range: `8.5.12` and up, not 9.** Per the spike, the reading API gives the same output on 8.5.12, 9.0.0
  and 9.2.6; 8.0.0 does not compile unchanged (other generic constraints on `StateMachineVisitor`). The packages
  declare `MassTransit >= 8.5.12`, which NuGet resolves to 8.5.12 (Apache-2.0) and never to 9. **MassTransit 9 is
  under a commercial license** (Massient): a package that selected 9 would bring that license to everyone who
  installs it, so none of ours references 9 and the build never restores it into a package. An application that uses
  9 itself still works, because the range has no upper bound. A second CI job builds and tests against the latest
  9.x and fails when the output differs from the goldens; it is a check, not a dependency. Lowering the lower bound
  below 8.5.12 needs a green test run on that version.
- Reading private fields by reflection (`Unschedule`, the delay of `Schedule`) is allowed only with a test per
  supported version that fails when MassTransit renames them (spike recommendation).

### 3. The contract with the TypeScript side

1. **`docs/specs/saga.schema.json` is the one definition of the format**, together with
   [`diagram-format.md`](../specs/diagram-format.md): one `version` for YAML and JSON (ADR 0028). The .NET side has no
   model of its own to define; a format change is made in the schema and the spec first, then in both readers
   in the same pull request. The .NET tests validate every document they write against the schema.
2. **Shared golden files.** The expected diagrams of the sample sagas (`samples/library/*/*.saga.yaml`, and
   `samples/sagas/`) are the goldens. Today only the TypeScript importer compares against them, and only the YAML;
   the `*.saga.json` goldens are new and are added with the .NET tests (#506 and the PBIs after it). The .NET tests
   build the machine of each sample (the sample projects are compiled into the test project; today CI only compiles
   them in the `generated-csharp` job) and compare the output of both writers (ADR 0028: key order, indent, trailing
   newline) with the golden. Because the two readers know different things (section 3.4), the comparison is
   by bytes only for what both know: guard text, places in the source and `edge-n` order are normalised before
   the comparison, and a sample with guards (for example `payment-retries`, `loan-application`) is compared
   with its guard text blanked. A golden is changed once, for both sides.
3. **The id scheme of ADR 0007 is kept**: `start-1`, `state-<kebab-name>`, `end-1`, `any-1`, `edge-1…`, with state
   names as the property names. The .NET reader numbers `edge-n` in the order of the machine (the order the visitor
   visits), the tree-sitter reader in source order; for most machines these are the same. Where they are not, the
   difference is the order of `edge-n` only. Tools that compare two diagrams (`ariadne diff`, the merge of the
   editor) match states by name and edges by their ends and event, never by `edge-n`.
4. **Who wins when the two readers disagree.** They answer different questions, so neither wins everywhere:
   - **Structure** (states, events and their message types, transitions, which activities run) comes from the
     **built machine**: it is what MassTransit will run. A difference the tree-sitter reader shows against a built
     machine is a warning of the importer, not of the library.
   - **Text and places** (the text of guards and correlation expressions, the location of a state or transition in
     the source) come from **tree-sitter**: a built machine has only a delegate. The library leaves a guard text
     empty (an edge with a guard marker and no text) and never makes one up.
   - Neither reader overwrites the other's file. Merging the two is `ariadne diff` and the [diagram merge](../specs/diagram-merge.md),
     run by a person; the library writes what it reads and nothing else.
   - A difference that is not explained by these two rules is a bug in one reader and is fixed against the schema
     and a new golden.

### 4. Versioning and release

- **The packages follow the version of the repository** (ADR 0015, ADR 0006 point 7): GitVersion from the
  Conventional Commits, the same `X.Y.Z` as the container, the CLI and the viewer. The version is passed at pack
  time (`dotnet pack -p:Version=…`); no project file holds a number. A release publishes all four packages with
  that version, also when one did not change, so a user can tell which packages fit together by one number.
- **They reach NuGet.org** from the `release` job on `main` (ADR 0027: the release pull request), after the
  .NET build and test jobs pass: `dotnet pack` with symbols and Source Link, then `dotnet nuget push` with
  `--skip-duplicate`. The publish uses NuGet trusted publishing (OIDC, short-lived key) when the account allows
  it; otherwise a key in an environment secret of the `release` job only. It is never available to a pull request
  from a fork, and nothing is published from `release/next` (ADR 0019).
- Dependencies of `dotnet/` are updated by Renovate and locked (`packages.lock.json`, restore with
  `--locked-mode`), like the pnpm lockfile (ADR 0019).
- The package ids are reserved on NuGet.org by the maintainers before the first publish; that and the key are
  the manual steps of the issue that adds the release job.

### 5. Why this answers ADR 0007

ADR 0007 rejected a .NET reader for three reasons. The library answers them like this, and ADR 0007 stays right for
its own case (the browser, the CLI and the extension, which have no assembly to load):

| Objection of ADR 0007                      | Answer                                                                                                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| It needs a backend                         | The library runs **in the user's own process**, in the application that already builds the state machine. Ariadne adds no service, no host and no copy of the code.                                                     |
| The source code leaves the machine         | Nothing is sent anywhere. What leaves is the diagram (states, events, message type names), served by the user's own application to the people the user already lets in, or written to a file by the user's own command. |
| It loads the user's assembly and runs code | The code that is run is the user's own, in the user's own process, started by the user (the application, the test, or the tool run on an assembly they name). The library does not load anything on its own; see below. |

What the library reads is the machine **after** its constructor has run, which is also what MassTransit does at start-up. It does not
create saga instances, does not send or publish messages, does not run a handler (`Then` is not called), and does
not attach to a bus.

### 6. What the library must never do

These are rules of the code and are tested.

1. **No network of its own.** No outgoing connection, no telemetry, no update check, no download of a schema or a
   license. The ASP.NET Core package answers requests the application routes to it; it makes none.
2. **No writes outside the path it is given.** The writers write to the stream or the file path the caller passes
   and nowhere else (no temporary folder next to it, no cache, no user profile). The tool writes under the output
   path named on its command line, creates no folder outside it, and never overwrites without being told to.
3. **No endpoint is mapped without the application asking.** There is no auto-registration, no startup hook, no
   module initializer and no `IStartupFilter`. Endpoints exist only after the application calls
   `MapAriadneSagas(…)` on its own route builder, under the prefix it chooses. The application can put authorization
   on the group it gets back, and the endpoints are read-only (`GET` only).
4. **No run of the user's code beyond building the machine**, as above; and no load of an assembly the caller has not
   named (the tool takes the assembly path as an argument and loads nothing else).

## Consequences

- The repository has two toolchains. `AGENTS.md` and `CONTRIBUTING.md` name the .NET part and its commands
  (`dotnet build`, `dotnet test`, `dotnet format --verify-no-changes`, all on `dotnet/Ariadne.slnx`); the root `pnpm`
  scripts do not run them. The dev container already has the SDK.
- ADR 0006 point 1 ("TypeScript only") and the layout in it gain `dotnet/`. The TypeScript monorepo rules are
  unchanged: nothing in `packages/` or `apps/` depends on `dotnet/`, and `@ariadne/core` stays without a framework.
- ADR 0007 remains the decision for source-level import; the built-machine reader is a second reader that sits beside it.
  The `@ariadne/masstransit` importer does not go away and stays the way to read a saga without building the code.
- Changing the schema or a golden now touches two test suites; the `PR checks` workflow already asks for an ADR when
  the schema changes (`governance.adrPaths`).
- The release adds NuGet to the places a release goes (the image, the GitHub release, npm, the extension, the CLI).
- MassTransit 9 users are supported by the check, not by the dependency: if the output on 9.x changes, the job turns
  red and a decision is needed (a separate package line for 9, or none).
- The follow-ups are #506 (solution, test project, CI) and the PBIs of #503 that implement the reader, the JSON and
  YAML writers, the endpoints and the tool.
