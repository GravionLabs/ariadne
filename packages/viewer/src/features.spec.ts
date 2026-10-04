import { parseFeatures } from './features';

describe('parseFeatures', () => {
  it('reads space and comma separated names, in a fixed order', () => {
    expect(parseFeatures('problems  walkthrough')).toEqual(['walkthrough', 'problems']);
    expect(parseFeatures('messages,problems')).toEqual(['messages', 'problems']);
  });

  it('ignores unknown names and accepts lists, null and nothing', () => {
    expect(parseFeatures('walkthrough editing')).toEqual(['walkthrough']);
    expect(parseFeatures(['messages', 'x'])).toEqual(['messages']);
    expect(parseFeatures(null)).toEqual([]);
    expect(parseFeatures(undefined)).toEqual([]);
    expect(parseFeatures('')).toEqual([]);
  });
});
