export interface SidebarItem {
  text: string;
  link: string;
}

/**
 * The pages of the guide in the order of the numbered list of `docs/guide/README.md`, so that a new
 * page is added in one place: `1. [Getting started](getting-started.md): …`.
 */
export function guidePages(readme: string): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const line of readme.split('\n')) {
    const found = /^\d+\.\s+\[([^\]]+)\]\(([^)#\s]+)\.md(?:#[^)\s]*)?\)/.exec(line);
    if (found) items.push({ text: found[1], link: `/guide/${found[2]}` });
  }
  return items;
}

/** The sidebar of the site: the guide, then the reference pages that are not in the list. */
export function sidebarOf(readme: string) {
  return [
    {
      text: 'User guide',
      items: [{ text: 'Overview and samples', link: '/guide/' }, ...guidePages(readme)],
    },
    {
      text: 'Reference',
      items: [
        { text: 'Diagram file format', link: '/specs/diagram-format' },
        { text: 'Self-hosting', link: '/self-hosting' },
      ],
    },
  ];
}
