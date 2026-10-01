# Diagram file format (version 1)

Ariadne stores one diagram per YAML file (`.yaml` / `.yml`). Files are meant to be committed to git.
The format is designed so that an unchanged diagram is written byte-for-byte identically.

## Example

```yaml
version: 1
nodes:
  - id: start-1
    type: start
    name: Start
    position:
      x: 0
      y: 0
  - id: step-1
    type: step
    name: Charge card
    position:
      x: 200
      y: 10
    description: Calls the payment provider
    retry: 3 attempts, exponential backoff
    timeout: 30s
    compensation:
      name: Refund
  - id: end-1
    type: end
    name: End
    position:
      x: 400
      y: 0
edges:
  - id: edge-1
    source: start-1
    target: step-1
    kind: forward
  - id: edge-2
    source: step-1
    target: end-1
    kind: forward
```

## Fields

| Field     | Type    | Required | Notes                                                         |
| --------- | ------- | -------- | ------------------------------------------------------------- |
| `version` | integer | yes      | Must be `1`. Files with another version are rejected.         |
| `nodes`   | list    | no       | Defaults to empty.                                            |
| `edges`   | list    | no       | Defaults to empty. Every `source`/`target` must be a node id. |

### Node

| Field          | Type                                     | Required | Notes                                                  |
| -------------- | ---------------------------------------- | -------- | ------------------------------------------------------ |
| `id`           | string                                   | yes      | Unique within the file, e.g. `step-3`.                 |
| `type`         | `start` \| `step` \| `decision` \| `end` | yes      | `start` has no incoming, `end` no outgoing edges.      |
| `name`         | string                                   | yes      | Label shown on the canvas.                             |
| `position`     | `{ x: number, y: number }`               | yes      | Canvas position of the node's top-left corner (px).    |
| `description`  | string                                   | no       | Documentation only.                                    |
| `retry`        | string                                   | no       | Free text, e.g. `3 attempts`. Documentation only.      |
| `timeout`      | string                                   | no       | Free text, e.g. `30s`. Documentation only.             |
| `compensation` | `{ name: string, description?: string }` | no       | Undo action of a saga step (only meaningful on steps). |

### Edge

| Field    | Type                        | Required | Notes                  |
| -------- | --------------------------- | -------- | ---------------------- |
| `id`     | string                      | yes      | e.g. `edge-4`.         |
| `source` | string                      | yes      | Node id.               |
| `target` | string                      | yes      | Node id.               |
| `kind`   | `forward` \| `compensation` | no       | Defaults to `forward`. |

## Determinism

The writer (`src/app/model/diagram-yaml.ts`) guarantees stable output:

- keys are always written in the order listed above;
- nodes and edges keep their order in the diagram (new elements are appended);
- positions are rounded to whole pixels;
- optional fields that are not set are omitted;
- lines are never wrapped.

## Errors

Invalid files are rejected as a whole, and the current diagram is left unchanged. The error message names the
offending path, e.g. `nodes[2].type must be one of start, end, step, decision` or
`edges[0].target "step-9" is not a node`.
