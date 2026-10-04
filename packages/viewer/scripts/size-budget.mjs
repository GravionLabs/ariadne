/**
 * The viewer is embedded in other people's pages and apps, so its size matters. Budgets are gzip
 * sizes in bytes: about 15% above what each file was when the budget was set (see
 * docs/specs/performance-budgets.md). A file over its budget fails the build; above 90% of it,
 * the build warns.
 */
export const BUDGETS = {
  'dist/ariadne-viewer.js': 77_000,
  'dist/index.js': 104_000,
  'dist/angular/index.js': 2_600,
};

/** Share of a budget above which a warning is given. */
export const WARN_AT = 0.9;

/**
 * Judges measured sizes against budgets.
 * @param {{ file: string, raw: number, gzip: number }[]} sizes
 * @param {Record<string, number>} budgets gzip bytes by file
 * @returns {{ file: string, raw: number, gzip: number, budget: number, share: number, status: 'ok' | 'warning' | 'over' }[]}
 */
export function evaluate(sizes, budgets = BUDGETS) {
  return sizes.map(({ file, raw, gzip }) => {
    const budget = budgets[file];
    if (budget === undefined) throw new Error(`No size budget for ${file}`);
    const share = gzip / budget;
    return {
      file,
      raw,
      gzip,
      budget,
      share,
      status: share > 1 ? 'over' : share > WARN_AT ? 'warning' : 'ok',
    };
  });
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

/** The table printed by the script. */
export function table(results) {
  const rows = results.map((r) => [
    r.file,
    kb(r.raw),
    kb(r.gzip),
    kb(r.budget),
    `${Math.round(r.share * 100)}%`,
    r.status,
  ]);
  const head = ['file', 'raw', 'gzip', 'budget (gzip)', 'used', ''];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) =>
    cells
      .map((c, i) => c.padEnd(widths[i]))
      .join('  ')
      .trimEnd();
  return [line(head), ...rows.map(line)].join('\n');
}
