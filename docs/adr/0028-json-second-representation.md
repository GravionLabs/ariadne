# ADR 0028: JSON as a second representation of a diagram

- Status: Proposed
- Date: 2026-11-15
- Issues: #493, #492, #502
- Amends: [ADR 0002](0002-yaml-files-and-file-storage.md)

## Context

ADR 0002 decides "one YAML file per diagram". That is right for the files people write, review and commit. It is
less right for the places where a saga does not come from a file but from a program: a REST API that serves the
sagas of a service (the .NET library, #502, will do that), the viewer that draws what such an API returns, and tools
that already speak JSON. YAML there means a YAML writer in every producer; JSON is in every runtime.

A second container for the same model is an architectural decision, so it is made before code follows: what JSON is
for, and what it is not for.

The numbers 0025 and 0026 are reserved by #433 and #441, and 0027 is taken by the release branch; this ADR is 0028.

## Decision

1. **JSON is for transport, not for storage.** REST APIs, the viewer and tools exchange sagas as JSON. Diagrams that
   people keep in a repository stay `*.saga.yaml`. Nothing of ADR 0002 is superseded: one YAML file per diagram
   remains the file format, `FileStorage` is unchanged, and no `*.saga.json` file extension is introduced.
2. **Same model, same version.** A JSON document is the diagram file as JSON: the same keys, the same validation, the
   same `version: 3` (see [`diagram-format.md`](../specs/diagram-format.md)). There is no JSON-only field and no
   second version number. A format change bumps `version` once, for both containers.
3. **Deterministic JSON output.** The writer emits keys in the order of the YAML writer (`version`, `name`,
   `description`, `saga`, `events`, `direction`, `nodes`, `edges`, and the element order within), omits unset and
   empty optional fields, indents with two spaces and ends with a single trailing newline. The same diagram gives the
   same bytes, so JSON diffs too.
4. **An optional top-level `$schema` string.** It names the JSON Schema of the format
   ([`saga.schema.json`](../specs/saga.schema.json)) so editors can validate and complete. The reader accepts it in
   both containers (in YAML too, where the schema is otherwise given by a comment) and ignores it; the writer emits
   it only when the diagram carries one.
5. **What each surface does with JSON.**
   - **Viewer:** draws it. It reads YAML and JSON, whichever the URL or attribute delivers.
   - **CLI:** reads JSON everywhere it reads a saga, and converts in both directions (YAML to JSON, JSON to YAML).
   - **Web app:** opens JSON and saves YAML. Saving never writes JSON, so a file in a repository does not change
     container by accident.
   - **VS Code extension:** unchanged. It edits `*.saga.yaml`.
6. **REST shape for producers** (the viewer and the .NET library follow it):
   - Media type `application/json`. The viewer sends `Accept: application/json` and reads the body as JSON when the
     response says so; a `*.saga.yaml` URL is still read as YAML.
   - **One saga per resource**: `GET /sagas/{name}` returns one diagram document as above, with no envelope.
   - **A list of sagas** is a JSON array of objects `{ "name": string, "title": string, "link": string }`. `name` is
     the identifier used in the URL, `title` the display text, `link` the URL of the saga resource (absolute, or
     relative to the list). The list carries no diagram content; a consumer follows `link`.
   - Errors use the status codes of HTTP (404 for an unknown saga) and need no body the viewer depends on; it shows
     its existing network error.
7. **The `yaml` package stays the parser for both containers.** JSON is a subset of YAML 1.2, so `parse()` reads a
   JSON document through the same validation path, and the viewer keeps one reader. A JSON-only reader (JSON.parse
   plus the same validation) is possible later but would not be able to read the `*.saga.yaml` the viewer reads today.
   Measured on `packages/viewer/src/define.ts`, bundled with esbuild (ES2022, minified, as `dist/ariadne-viewer.js`),
   with `yaml` replaced by a `JSON.parse` stub for the second row:

   | Viewer bundle      | Raw      | Gzip    | Brotli  |
   | ------------------ | -------- | ------- | ------- |
   | `yaml` parses both | 213.6 kB | 70.2 kB | 62.5 kB |
   | JSON-only reader   | 115.6 kB | 39.7 kB | 35.6 kB |
   | Difference         | 98.0 kB  | 30.5 kB | 26.9 kB |

   A JSON-only viewer would be 44% smaller (gzip). That is worth a separate build entry when an embedder asks for it
   (it is a follow-up, not part of this decision); it is not worth losing YAML in the default build, and the
   performance budget of ADR 0018 (77 kB gzip for `ariadne-viewer.js`) is met either way.

## Consequences

- Producers need no YAML library: a .NET service serializes its model to JSON and serves it.
- One validation path and one version number for both containers; the reader tests cover JSON with the cases that
  already cover YAML.
- JSON has no comments, so a diagram that went through JSON loses the comments of its YAML source. That is why the
  web app and the CLI never replace a YAML file by its JSON form on their own.
- The format spec and the schema gain `$schema`; the JSON writer and reader, the CLI conversion and the viewer's
  `Accept` header are separate PBIs under #492.
