/**
 * Serious or critical axe findings under `root`, as `rule: selectors` lines, for specs to compare
 * with `[]`. jsdom has no layout, so the colour contrast rule is off: contrast is checked on the
 * tokens of the themes instead (`theme-contrast.spec.ts`).
 */
export async function axeFindings(root: HTMLElement = document.body): Promise<string[]> {
  const { default: axe } = await import('axe-core');
  const { violations } = await axe.run(root, {
    rules: { 'color-contrast': { enabled: false } },
  });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
