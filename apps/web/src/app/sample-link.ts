/** The address parameter that opens a sample, as in `…/app/?sample=order`. */
export const SAMPLE_PARAM = 'sample';

/**
 * The sample id in the address (`?sample=order`), or null. It is taken out of the address when it
 * is read (`history.replaceState`, no new entry in the history), so a reload or a copied address
 * does not open the sample again over what has been edited since. Other parameters and the hash stay.
 */
export function takeSampleParam(win: Window = window): string | null {
  const url = new URL(win.location.href);
  const id = url.searchParams.get(SAMPLE_PARAM);
  if (id === null) return null;
  url.searchParams.delete(SAMPLE_PARAM);
  win.history.replaceState(win.history.state, '', url);
  return id.trim() || null;
}
