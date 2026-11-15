# Merging a diagram into an existing file

After the first export people add descriptions, colors, the source of an external event, retry and
timeout notes. Writing a diagram that comes from code over the file must not delete them. The same
rules are used by `ariadne convert --merge` (`mergeDiagram` in `@ariadne/core`) and by the .NET
`diagram.Save(path)` (#511). The shared test cases are in
[`diagram-merge.cases.json`](diagram-merge.cases.json): each has `existing`, `incoming`, `expected`
(all diagram files as JSON) and `removed` (the messages, in order). Both implementations run them.

## Rules

- **Structure comes from the new input:** nodes, edges, events, activities, requests, routing slips,
  timers, ignores and the `saga` block.
- **From the existing file** (where it sets them): `name` and `description` of the diagram,
  `direction`, `spacing`; per node `description`, `color`, `retry`, `timeout`, `compensation`; per
  edge `eventSource` and `kind`. What the file does not set is taken from the new input.
- **Matching:** nodes by `id`; edges by `source`, `target`, `event` and `guard` (a matched edge keeps
  the `id` of the file).
- **Order:** elements that still exist stay where they are in the file; new ones are appended in
  their order of the new input.
- **Removed elements:** an element of the file that the input does not have is dropped and reported
  (`“Reserving” removed, its description is lost`). A renamed id is a removed and an added element.
  A caller may turn a non-empty report into a failure.
- YAML comments in the file are lost when it is written again.
