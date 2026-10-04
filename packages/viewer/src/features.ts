/** The opt-in extras of the viewer, switched on with `features="walkthrough messages problems"`. */
export const FEATURES = ['walkthrough', 'messages', 'problems'] as const;
export type ViewerFeature = (typeof FEATURES)[number];

/** Reads the `features` attribute (space or comma separated); unknown names are ignored. */
export function parseFeatures(
  value: string | readonly string[] | null | undefined,
): ViewerFeature[] {
  const names = typeof value === 'string' ? value.split(/[\s,]+/) : [...(value ?? [])];
  return FEATURES.filter((f) => names.includes(f));
}
