import { parseDiagram, serializeDiagramJson } from './diagram-yaml';

// The .NET library reads and writes these JSON files byte for byte (dotnet/tests, ADR 0031). They
// are `ariadne convert --to json` of every diagram of samples/ and docs/examples; this spec keeps
// them from drifting when the writer changes: regenerate them (and run the .NET tests) then.
const yamls = import.meta.glob(
  ['../../../samples/**/*.saga.yaml', '../../../docs/examples/*.saga.yaml'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const goldens = import.meta.glob(
  '../../../dotnet/tests/GravionLabs.Ariadne.MassTransit.Tests/golden/*.saga.json',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

describe('the JSON goldens of the .NET tests', () => {
  const byName = new Map(Object.entries(goldens).map(([path, text]) => [baseName(path), text]));

  it('has one for every diagram of samples/ and docs/examples', () => {
    const expected = Object.keys(yamls)
      .map((path) => baseName(path).replace(/\.yaml$/, '.json'))
      .sort();
    expect(expected.length).toBeGreaterThan(0);
    expect([...byName.keys()].sort()).toEqual(expected);
  });

  it.each(Object.entries(yamls).map(([path, text]) => [baseName(path), text]))(
    'is what the editor writes for %s',
    (name, yaml) => {
      expect(byName.get(name.replace(/\.yaml$/, '.json'))).toBe(
        serializeDiagramJson(parseDiagram(yaml)),
      );
    },
  );
});
