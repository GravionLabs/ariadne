# 0011 — Markdown documentation export

## Status

Accepted

## Context

A saga's diagram should live next to its code. Mermaid (ADR 0010) shows the flow, but READMEs and
wikis also need the details: what each state does, which events move the saga on, which messages
it sends.

## Decision

`diagramToMarkdown()` (`src/app/export/diagram-markdown.ts`) writes one page with these sections:

- **Title** and an optional description. The diagram has neither, and adding fields would change
  the YAML format, so the caller passes them; the editor titles the page with the file name.
- **Diagram**: the Mermaid block from `diagramToMermaid()`.
- **States**: type (initial, state, decision, final), description, activities, compensation, retry
  and timeout.
- **Transitions**: from, event, source, to, kind. The source is the event's `eventSource`, else
  `external` for an event the saga does not publish itself, `saga` for one it does.
- **Commands**: where each is sent. **Events**: internal or external, where they are published and
  which transitions they trigger.

Rows follow the diagram's order and messages are sorted by name, so the output is deterministic
and diffs cleanly. Table cells escape `|` and turn line breaks into `<br>`.

The Export menu saves it as `<name>.docs.md`, so it does not collide with the Mermaid-only `.md`.

## Consequences

- `ariadne docs` (CLI, #168) reuses the function once the exporters move to `packages/core` (#167).
- A diagram description needs a model field first; until then the description option stays empty
  in the editor.
