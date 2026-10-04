import { contrastRatio } from '../color';

/** A pair of tokens that must be told apart: the text or the part, the ground it is on, the least ratio. */
export type ContrastPair = [foreground: string, background: string, minimum: number];

/**
 * Resolves `var(--name)` references among tokens (`{ '--c-focus': 'var(--c-primary)', ... }`), so
 * that a token that points at another is compared by the colour it ends up as. Throws for a
 * reference to a token that is not there, or a reference that loops.
 */
export function resolveTokens(tokens: Record<string, string>): Record<string, string> {
  const resolve = (name: string, seen: string[]): string => {
    if (seen.includes(name))
      throw new Error(`Tokens refer to each other in a loop: ${[...seen, name].join(' → ')}`);
    const value = tokens[name];
    if (value === undefined) throw new Error(`No token ${name}`);
    const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
    return reference ? resolve(reference[1], [...seen, name]) : value.trim();
  };
  return Object.fromEntries(Object.keys(tokens).map((name) => [name, resolve(name, [])]));
}

/**
 * The pairs that are below their least contrast ratio, as `label: foreground on background (ratio)`
 * lines, in the order of `pairs`. The ratio is cut (not rounded) to one decimal, so that a pair
 * under 4.5 never reads as 4.5. A token that is missing counts as a failure of the check itself.
 */
export function contrastFailures(
  label: string,
  tokens: Record<string, string>,
  pairs: readonly ContrastPair[],
): string[] {
  const failures: string[] = [];
  for (const [foreground, background, minimum] of pairs) {
    const [fg, bg] = [tokens[foreground], tokens[background]];
    if (fg === undefined || bg === undefined) {
      throw new Error(`${label}: no token ${fg === undefined ? foreground : background}`);
    }
    const ratio = contrastRatio(fg, bg);
    if (ratio < minimum) {
      failures.push(
        `${label}: ${foreground} on ${background} (${(Math.floor(ratio * 10) / 10).toFixed(1)})`,
      );
    }
  }
  return failures;
}
