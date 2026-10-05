import { afterEach, describe, expect, it } from 'vitest';
import { takeSampleParam } from './sample-link';

describe('takeSampleParam', () => {
  const original = location.href;
  afterEach(() => history.replaceState(null, '', original));
  const at = (search: string, hash = '') =>
    history.replaceState({ n: 1 }, '', `/app/${search}${hash}`);

  it('is null when the address has no sample', () => {
    at('');
    expect(takeSampleParam()).toBeNull();
    at('?other=1');
    expect(takeSampleParam()).toBeNull();
    expect(location.search).toBe('?other=1');
  });

  it('gives the id and takes it out of the address, keeping other parameters, the hash and the state', () => {
    at('?a=1&sample=order&b=2', '#top');
    expect(takeSampleParam()).toBe('order');
    expect(location.pathname).toBe('/app/');
    expect(location.search).toBe('?a=1&b=2');
    expect(location.hash).toBe('#top');
    expect(history.state).toEqual({ n: 1 });
    expect(takeSampleParam()).toBeNull();
  });

  it('removes an empty sample parameter too, and reads it as nothing', () => {
    at('?sample=');
    expect(takeSampleParam()).toBeNull();
    expect(location.search).toBe('');
    at('?sample=%20');
    expect(takeSampleParam()).toBeNull();
  });

  it('decodes the id', () => {
    at('?sample=travel%2Dbooking');
    expect(takeSampleParam()).toBe('travel-booking');
  });
});
