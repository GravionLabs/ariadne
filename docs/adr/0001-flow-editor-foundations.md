# ADR 0001: Foundations of the flow editor

- Status: accepted (recorded after the fact; the decisions were made when the project started)
- Date: 2026-10-03
- Issues: #1, #21, #22

## Context

Teams that build sagas with MassTransit want a picture of what the saga does, next to the code, and
they want it to stay accurate. Ariadne is a diagram editor for that. Four choices shaped everything
else, and they are recorded here so later ADRs (file format, auto-layout, source view, ...) can build
on them.

## Decision

1. **Angular, with [Foblex f-flow](https://github.com/Foblex/f-flow) for the canvas.**
   - f-flow is Angular-native: nodes and connections are ordinary Angular components and templates, so
     the cards, labels and the "+" buttons are plain components, not canvas drawings.
   - It brings what a diagram editor needs and would otherwise be built by hand: dragging, connecting,
     selection, zoom and pan, a minimap, a keyboard layer (`withA11y`) and theming through CSS
     variables.
   - We use it in its "classic" mode: the app owns the state (`DiagramStore`) and f-flow only renders
     it and reports gestures. Nothing in the file format or the model depends on f-flow, so the canvas
     can be replaced without touching them.
   - Mermaid and similar tools only render a diagram; they cannot be edited on the canvas. That is
     fine as an _export_ (planned), not as the editor.
2. **Documentation only.** A diagram describes a saga; it is never executed, validated against a
   running system, or turned into a workflow engine definition. This keeps the model small (states,
   transitions, events, activities) and lets it follow MassTransit's vocabulary instead of a
   general-purpose workflow language.
3. **Diagrams are local YAML files that live in git.** One diagram, one file, deterministic output so
   diffs show only real changes, and no server or database. The format and the `FileStorage`
   abstraction are in [ADR 0002](0002-yaml-files-and-file-storage.md); the specification is
   [docs/specs/diagram-format.md](../specs/diagram-format.md).
4. **Web first, desktop optional.**
   - The product is a web app. Everything native, such as opening and saving files, sits behind an
     interface (`FileStorage`), so the web build runs without any desktop shell.
   - A Tauri 2 desktop shell stays possible because of that interface. It is on hold (#36): the web
     app covers the use cases, and the planned VS Code extension covers working next to the code.

Conventions that go with these:

- **pnpm only**, never npm or yarn.
- Standalone Angular components, signals, and Vitest for tests.
- Work is tracked as Epic → Feature → PBI → Task with GitHub sub-issues, and architectural changes get
  an ADR in `docs/adr/`.

## Consequences

- The canvas is tied to Angular and f-flow, but only the editor code is: the model, the YAML format
  and the layout calculation are plain TypeScript with no framework imports. That is what allows them
  to move into shared packages later for a CLI and a VS Code extension.
- Because diagrams are files in git, there is no sharing, permissions or history feature to build;
  git provides them. The cost is that two people cannot edit one diagram at the same time.
- Because diagrams are documentation, nothing stops a diagram from drifting away from the code. Import
  from and generation to C#, and a drift check, are planned to keep them honest.
- Browsers without the File System Access API (Firefox, Safari) cannot save in place; they download a
  copy. A desktop shell or the VS Code extension would remove that limit.
