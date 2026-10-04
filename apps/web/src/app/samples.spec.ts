import { parseDiagram } from '@ariadne/core';
import {
  SAMPLE_GROUPS,
  Sample,
  TOUR_SAMPLES,
  findSample,
  loadLibrarySamples,
  loadSamples,
  sampleDiagram,
} from './samples';
import { listFolders, readSource } from './testing/read-source';

// Loaded before the tests are collected, because `it.each` below needs the list.
const SAMPLES: readonly Sample[] = await loadSamples();

describe('the samples', () => {
  it('has the tour at once, and loads the library as a chunk of its own', async () => {
    expect(TOUR_SAMPLES.map((s) => s.id)).toEqual(['order', 'booking', 'travel-booking']);
    const library = await loadLibrarySamples();
    expect(library.length).toBeGreaterThanOrEqual(5);
    // Loaded once: the same module the next time.
    expect(await loadLibrarySamples()).toBe(library);
  });

  it('finds a sample by id, from the tour or the library, and not one that is not there', async () => {
    expect((await findSample('order'))?.group).toBe('tour');
    expect((await findSample('trip-booking'))?.group).toBe('library');
    expect(await findSample('no-such-sample')).toBeUndefined();
  });

  it('has the tour first, unchanged, and then the library', () => {
    expect(SAMPLES.slice(0, 3).map((s) => [s.id, s.group, s.title])).toEqual([
      ['order', 'tour', 'Order saga'],
      ['booking', 'tour', 'Booking saga'],
      ['travel-booking', 'tour', 'Travel booking'],
    ]);
    expect(SAMPLES.slice(3).every((s) => s.group === 'library')).toBe(true);
    expect(SAMPLE_GROUPS.map((g) => g.id)).toEqual(['tour', 'library']);
  });

  it('has an id of its own for every sample', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every folder of samples/library, so that a new sample cannot be left out', () => {
    const folders = listFolders('../../samples/library');
    expect(folders.length).toBeGreaterThanOrEqual(5);
    expect(
      SAMPLES.filter((s) => s.group === 'library')
        .map((s) => s.id)
        .sort(),
      'add the import and the line for the new sample in samples.ts',
    ).toEqual(folders);
  });

  it.each(SAMPLES.map((s) => [s.id, s] as const))('opens %s as a diagram', (_id, sample) => {
    const diagram = sampleDiagram(sample);
    expect(diagram.nodes.length).toBeGreaterThan(2);
    // A new copy each time, so editing one cannot change the sample.
    expect(sampleDiagram(sample)).not.toBe(diagram);
    expect(parseDiagram(sample.yaml)).toEqual(diagram);
  });

  it('gets the title and description of a library sample from its README', () => {
    const sample = SAMPLES.find((s) => s.id === 'order-fulfilment')!;
    const readme = readSource('../../samples/library/order-fulfilment/README.md');
    expect(readme.startsWith(`# ${sample.title}\n`)).toBe(true);
    expect(sample.title).toBe('Order fulfilment');
    expect(sample.description).toMatch(
      /^Takes an order from the shop to the customer's door:.*closed\.$/,
    );
    // One sentence, and not a README paragraph with more.
    expect(sample.description).not.toContain('. ');
  });

  it('gives every library sample a title and one sentence', () => {
    for (const sample of SAMPLES.filter((s) => s.group === 'library')) {
      expect(sample.title, sample.id).toMatch(/\S/);
      expect(sample.description, sample.id).toMatch(/^[A-Z].*[.]$/);
      expect(sample.description, sample.id).not.toMatch(/[`*\[\]]/);
    }
  });
});
