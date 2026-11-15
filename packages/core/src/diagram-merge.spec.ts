import rawCases from '../../../docs/specs/diagram-merge.cases.json';
import { describe, expect, it } from 'vitest';
import { mergeDiagram } from './diagram-merge';
import { serializeDiagramJson, validateDiagram, validateDiagramWithNotes } from './diagram-yaml';

interface Case {
  name: string;
  existing: unknown;
  incoming: unknown;
  expected: unknown;
  removed: string[];
}

const cases = rawCases as Case[];

describe('mergeDiagram: the shared cases of docs/specs/diagram-merge.md', () => {
  for (const c of cases) {
    it(c.name, () => {
      const existing = validateDiagramWithNotes(c.existing);
      const { diagram, removed } = mergeDiagram(existing.diagram, validateDiagram(c.incoming), {
        existingDirectionSet: existing.directionSet,
      });
      expect(serializeDiagramJson(diagram)).toBe(serializeDiagramJson(validateDiagram(c.expected)));
      expect(removed.map((r) => r.message)).toEqual(c.removed);
    });
  }

  it('fills what the file leaves open from the new input', () => {
    const existing = validateDiagram({
      version: 3,
      nodes: [{ id: 's', type: 'start', name: 'I' }],
      edges: [],
    });
    const incoming = validateDiagram({
      version: 3,
      name: 'From code',
      nodes: [{ id: 's', type: 'start', name: 'I' }],
      edges: [],
    });
    expect(mergeDiagram(existing, incoming).diagram.name).toBe('From code');
  });
});
