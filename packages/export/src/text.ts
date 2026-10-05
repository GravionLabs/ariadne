/**
 * Replaces every run of whitespace that holds a line break with `replacement`, like a
 * regular expression of optional whitespace, a line break and optional whitespace, but in linear time: that pattern backtracks quadratically on a long
 * run of spaces without a line break, and the text comes from files and from the user.
 */
export function replaceLineBreaks(s: string, replacement: string): string {
  return s.replace(/\s+/g, (run) => (run.includes('\n') ? replacement : run));
}

/** `s` without the character `char` at both ends (a regular expression for it is quadratic on a long run before a non-match). */
export function trimChar(s: string, char: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === char) start++;
  while (end > start && s[end - 1] === char) end--;
  return s.slice(start, end);
}
