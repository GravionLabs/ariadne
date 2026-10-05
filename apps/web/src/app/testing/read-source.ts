/** The few parts of Node that a spec needs; the unit tests run in Node, and the bundler cannot import it. */
interface NodeProcess {
  cwd(): string;
  getBuiltinModule(name: 'node:fs'): {
    readFileSync(path: string, encoding: 'utf8'): string;
    readdirSync(
      path: string,
      options: { withFileTypes: true },
    ): { name: string; isDirectory(): boolean }[];
  };
}

/**
 * The text of a source file of the app, given its path from `apps/web` (`src/styles.scss`). For
 * specs that check what is written in a file (the theme tokens) and cannot import it as text: the
 * bundler of the unit tests has no loader for `.scss`.
 */
export function readSource(path: string): string {
  const node = (globalThis as unknown as { process: NodeProcess }).process;
  const fs = node.getBuiltinModule('node:fs');
  // `ng test` runs in apps/web; a run from the repository root finds it one level down.
  for (const base of [node.cwd(), `${node.cwd()}/apps/web`]) {
    try {
      return fs.readFileSync(`${base}/${path}`, 'utf8');
    } catch {
      // Try the next place.
    }
  }
  throw new Error(`Cannot find ${path} from ${node.cwd()}`);
}

/** The names of the folders in a folder of the repository, given its path from `apps/web`. */
export function listFolders(path: string): string[] {
  const node = (globalThis as unknown as { process: NodeProcess }).process;
  const fs = node.getBuiltinModule('node:fs');
  for (const base of [node.cwd(), `${node.cwd()}/apps/web`]) {
    try {
      return fs
        .readdirSync(`${base}/${path}`, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
    } catch {
      // Try the next place.
    }
  }
  throw new Error(`Cannot find ${path} from ${node.cwd()}`);
}
