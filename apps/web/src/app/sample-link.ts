/** The address parameters that open a sample, and its example path: `…/app/?sample=order&path=example`. */
export const SAMPLE_PARAM = 'sample';
export const PATH_PARAM = 'path';

/** What the address asks to open on start. */
export interface StartParams {
  /** The id of a sample, or null. */
  sample: string | null;
  /** `example` for the sample's example path; anything else is reported, null for none. */
  path: string | null;
}

/**
 * The sample (`?sample=order`) and path (`&path=example`) in the address. They are taken out of the
 * address when read (`history.replaceState`, no new entry in the history), so a reload or a copied
 * address does not open the sample again over what has been edited since. Other parameters and the
 * hash stay.
 */
export function takeStartParams(win: Window = window): StartParams {
  const url = new URL(win.location.href);
  const read = (name: string) => {
    const value = url.searchParams.get(name);
    url.searchParams.delete(name);
    return value === null ? null : value.trim() || null;
  };
  const had = url.searchParams.has(SAMPLE_PARAM) || url.searchParams.has(PATH_PARAM);
  const params = { sample: read(SAMPLE_PARAM), path: read(PATH_PARAM) };
  if (had) win.history.replaceState(win.history.state, '', url);
  return params;
}

/** The sample id in the address, or null; takes the sample and path parameters out of it. */
export function takeSampleParam(win: Window = window): string | null {
  return takeStartParams(win).sample;
}
