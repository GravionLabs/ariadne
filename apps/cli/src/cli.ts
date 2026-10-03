import { parseArgs } from 'node:util';
import pkg from '../package.json' with { type: 'json' };
import {
  DiagramFormatError,
  Diagram,
  Finding,
  Severity,
  parseDiagram,
  serializeDiagram,
  validate,
} from '@ariadne/core';
import {
  CSharpParser,
  ImportResult,
  SourceFile,
  diffDiagrams,
  generateSaga,
  importSagas,
} from '@ariadne/masstransit';
import { diagramToMarkdown, diagramToMermaid, renderDiagramSvg } from '@ariadne/export';

/** Everything the command line touches, so it can be run and tested without a process. */
export interface Io {
  readText(path: string): Promise<string>;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  stdout(text: string): void;
  stderr(text: string): void;
  /** The C# parser; loaded on demand, because only `import` and `diff` need it. */
  csharpParser(): Promise<CSharpParser>;
}

export const VERSION: string = pkg.version;

export const USAGE = `ariadne ${VERSION}: check, export and convert saga diagrams to and from C#

Usage:
  ariadne lint <file.saga.yaml…> [--format text|json] [--max-warnings <n>]
  ariadne export <file.saga.yaml> --format mermaid|svg|png|md [-o <file>]
  ariadne generate <file.saga.yaml> [-o <dir>]
  ariadne import <file.cs…> [-o <dir>]
  ariadne diff <file.saga.yaml> <file.cs…> [--class <name>]

Commands:
  lint      Report modelling mistakes. Exits with 1 when there are errors (or more warnings
            than --max-warnings), so it can fail a CI build.
  export    Write the diagram as Mermaid text, SVG, PNG or a Markdown documentation page.
            Text formats go to the standard output unless -o is given; PNG needs -o.
  generate  Write the MassTransit state machine, saga instance and message contracts as C# files
            into the directory given with -o (default: the current one). What could not be
            generated is reported on the standard error.
  import    Read MassTransit saga state machines from C# files and write each as a *.saga.yaml file
            into the directory given with -o (default: the current one). What could not be shown
            is reported on the standard error, with file and line. Exits with 1 if no saga is found.
  diff      Compare a diagram with the C# that implements it: missing and extra states,
            transitions, sent and published messages. Exits with 1 when they differ, so it can
            fail a CI build. --class picks the state machine when the files have several.

Options:
  -h, --help      Show this text
  -v, --version   Show the version

Exit codes: 0 all good, 1 findings, 2 wrong usage or a file that cannot be read or written.
`;

/** Thrown for a mistake in how the command was used: shown with the usage, exit code 2. */
class UsageError extends Error {}

const SEVERITY_ORDER: readonly Severity[] = ['error', 'warning', 'info'];

/** Runs `ariadne` with `args` (without `node` and the script name); returns the exit code. */
export async function run(args: readonly string[], io: Io): Promise<number> {
  try {
    const [command, ...rest] = args;
    if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
      io.stdout(USAGE);
      return command === undefined ? 2 : 0;
    }
    if (command === '--version' || command === '-v') {
      io.stdout(`${VERSION}\n`);
      return 0;
    }
    if (command === 'lint') return await lint(rest, io);
    if (command === 'export') return await exportCommand(rest, io);
    if (command === 'generate') return await generateCommand(rest, io);
    if (command === 'import') return await importCommand(rest, io);
    if (command === 'diff') return await diffCommand(rest, io);
    throw new UsageError(`Unknown command “${command}”.`);
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`ariadne: ${e.message}\n\n${USAGE}`);
      return 2;
    }
    io.stderr(`ariadne: ${(e as Error).message}\n`);
    return 2;
  }
}

function options<T extends Record<string, { type: 'string' | 'boolean'; short?: string }>>(
  args: readonly string[],
  spec: T,
) {
  try {
    return parseArgs({ args: [...args], options: spec, allowPositionals: true });
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
}

// ---- lint

interface LintReport {
  file: string;
  findings: (Finding & { element?: string })[];
  /** Set when the file could not be read as a diagram at all. */
  invalid?: string;
}

async function lint(args: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = options(args, {
    format: { type: 'string' },
    'max-warnings': { type: 'string' },
  });
  if (positionals.length === 0) throw new UsageError('lint needs at least one file.');
  const format = values.format ?? 'text';
  if (format !== 'text' && format !== 'json') {
    throw new UsageError(`Unknown lint format “${format}”: use text or json.`);
  }
  const maxWarnings =
    values['max-warnings'] === undefined ? Infinity : Number(values['max-warnings']);
  if (Number.isNaN(maxWarnings) || maxWarnings < 0) {
    throw new UsageError('--max-warnings needs a number, 0 or more.');
  }

  const reports: LintReport[] = [];
  for (const file of positionals) {
    const text = await read(io, file);
    let diagram: Diagram;
    try {
      diagram = parseDiagram(text);
    } catch (e) {
      if (!(e instanceof DiagramFormatError)) throw e;
      reports.push({ file, findings: [], invalid: e.message });
      continue;
    }
    const names = new Map(
      [...diagram.nodes, ...diagram.edges].map((el) => [el.id, nameOf(diagram, el.id)]),
    );
    reports.push({
      file,
      findings: validate(diagram).map((f) => ({
        ...f,
        ...(f.elementId ? { element: names.get(f.elementId) } : {}),
      })),
    });
  }

  const count = (s: Severity) =>
    reports.reduce((n, r) => n + r.findings.filter((f) => f.severity === s).length, 0);
  const errors = count('error') + reports.filter((r) => r.invalid).length;
  const warnings = count('warning');

  if (format === 'json') {
    io.stdout(
      `${JSON.stringify(
        reports.map((r) => ({ file: r.file, invalid: r.invalid ?? null, findings: r.findings })),
        null,
        2,
      )}\n`,
    );
  } else {
    io.stdout(formatText(reports, { errors, warnings, hints: count('info') }));
  }
  return errors > 0 || warnings > maxWarnings ? 1 : 0;
}

function nameOf(diagram: Diagram, id: string): string {
  const node = diagram.nodes.find((n) => n.id === id);
  if (node) return node.name;
  const edge = diagram.edges.find((e) => e.id === id)!;
  const name = (nodeId: string) => diagram.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  return `${name(edge.source)} → ${name(edge.target)}`;
}

function formatText(
  reports: readonly LintReport[],
  total: { errors: number; warnings: number; hints: number },
): string {
  const lines: string[] = [];
  for (const report of reports) {
    if (report.invalid) {
      lines.push(`${report.file}: error: not a valid saga diagram: ${report.invalid}`);
      continue;
    }
    const sorted = [...report.findings].sort(
      (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    for (const f of sorted) {
      const where = f.element ? ` [${f.element}]` : '';
      lines.push(`${report.file}: ${f.severity}: ${f.message}${where} (${f.code})`);
    }
  }
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  lines.push(
    total.errors + total.warnings + total.hints === 0
      ? `No problems in ${plural(reports.length, 'file')}.`
      : `${plural(total.errors, 'error')}, ${plural(total.warnings, 'warning')}, ${plural(total.hints, 'hint')} in ${plural(reports.length, 'file')}.`,
  );
  return `${lines.join('\n')}\n`;
}

// ---- export

const FORMATS = ['mermaid', 'svg', 'png', 'md'] as const;
type ExportFormat = (typeof FORMATS)[number];

async function exportCommand(args: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = options(args, {
    format: { type: 'string', short: 'f' },
    output: { type: 'string', short: 'o' },
  });
  if (positionals.length !== 1) throw new UsageError('export needs exactly one file.');
  const format = values.format as ExportFormat | undefined;
  if (!format || !FORMATS.includes(format)) {
    throw new UsageError(`export needs --format ${FORMATS.join('|')}.`);
  }
  const [file] = positionals;
  let diagram: Diagram;
  try {
    diagram = parseDiagram(await read(io, file));
  } catch (e) {
    if (e instanceof DiagramFormatError) {
      io.stderr(`${file}: not a valid saga diagram: ${e.message}\n`);
      return 1;
    }
    throw e;
  }

  const title = diagram.name ?? baseName(file);
  let output: string | Uint8Array;
  switch (format) {
    case 'mermaid':
      output = diagramToMermaid(diagram);
      break;
    case 'md':
      output = diagramToMarkdown(diagram, { title });
      break;
    case 'svg':
      output = renderDiagramSvg(diagram).svg;
      break;
    case 'png':
      if (!values.output) throw new UsageError('A PNG goes to a file: add -o <file.png>.');
      output = await toPng(renderDiagramSvg(diagram).svg);
      break;
  }

  if (values.output) await write(io, values.output, output);
  else io.stdout(typeof output === 'string' ? ensureNewline(output) : '');
  return 0;
}

/** The image at 2×, like the PNG export in the editor. */
async function toPng(svg: string): Promise<Uint8Array> {
  const { Resvg } = await import('@resvg/resvg-js');
  return new Resvg(svg, {
    fitTo: { mode: 'zoom', value: 2 },
    background: '#ffffff',
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
}

// ---- generate

async function generateCommand(args: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = options(args, { output: { type: 'string', short: 'o' } });
  if (positionals.length !== 1) throw new UsageError('generate needs exactly one file.');
  const [file] = positionals;
  let diagram: Diagram;
  try {
    diagram = parseDiagram(await read(io, file));
  } catch (e) {
    if (e instanceof DiagramFormatError) {
      io.stderr(`${file}: not a valid saga diagram: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
  const dir = (values.output ?? '.').replace(/[\\/]+$/, '');
  const { files, warnings } = generateSaga(diagram);
  for (const f of files) {
    const path = `${dir}/${f.path}`;
    await write(io, path, f.content);
    io.stdout(`${path}\n`);
  }
  for (const w of warnings) io.stderr(`${file}: warning: ${w}\n`);
  return 0;
}

// ---- import and diff

/** Reads the C# files and finds the sagas in them; warnings go to the standard error. */
async function readSagas(files: readonly string[], io: Io): Promise<ImportResult> {
  const sources: SourceFile[] = [];
  for (const path of files) sources.push({ path, content: await read(io, path) });
  const result = await importSagas(sources, await io.csharpParser());
  for (const w of result.warnings) io.stderr(`${w.path}:${w.line}: warning: ${w.message}\n`);
  return result;
}

async function importCommand(args: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = options(args, { output: { type: 'string', short: 'o' } });
  if (positionals.length === 0) throw new UsageError('import needs at least one C# file.');
  const { sagas } = await readSagas(positionals, io);
  if (sagas.length === 0) {
    io.stderr('No MassTransit saga state machine found in the files.\n');
    return 1;
  }
  const dir = (values.output ?? '.').replace(/[\\/]+$/, '');
  for (const saga of sagas) {
    const path = `${dir}/${saga.className}.saga.yaml`;
    await write(io, path, serializeDiagram(saga.diagram));
    io.stdout(`${path}\n`);
  }
  return 0;
}

async function diffCommand(args: readonly string[], io: Io): Promise<number> {
  const { values, positionals } = options(args, { class: { type: 'string' } });
  const [file, ...code] = positionals;
  if (!file || code.length === 0) {
    throw new UsageError('diff needs a diagram and at least one C# file.');
  }
  let diagram: Diagram;
  try {
    diagram = parseDiagram(await read(io, file));
  } catch (e) {
    if (e instanceof DiagramFormatError) {
      io.stderr(`${file}: not a valid saga diagram: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
  const { sagas } = await readSagas(code, io);
  const wanted = values.class ?? diagram.saga?.className;
  const found = wanted
    ? sagas.find((s) => s.className === wanted)
    : sagas.length === 1
      ? sagas[0]
      : undefined;
  if (!found) {
    const have = sagas.map((s) => s.className).join(', ') || 'none';
    io.stderr(
      wanted
        ? `No state machine ${wanted} in the C# files (found: ${have}).\n`
        : `Which state machine? The C# files have: ${have}. Pass --class <name>.\n`,
    );
    return sagas.length === 0 || wanted ? 1 : 2;
  }
  const differences = diffDiagrams(diagram, found.diagram);
  if (differences.length === 0) {
    io.stdout(`${file} and ${found.className} agree.\n`);
    return 0;
  }
  for (const d of differences) io.stdout(`${file}: ${d.message}\n`);
  io.stdout(`${differences.length} ${differences.length === 1 ? 'difference' : 'differences'}.\n`);
  return 1;
}

const ensureNewline = (text: string): string => (text.endsWith('\n') ? text : `${text}\n`);

/** `dir/order.saga.yaml` → `order`. */
function baseName(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? file;
  return name.replace(/\.(saga\.)?ya?ml$/i, '') || 'Saga';
}

async function read(io: Io, file: string): Promise<string> {
  try {
    return await io.readText(file);
  } catch (e) {
    throw new Error(`cannot read ${file}: ${(e as Error).message}`);
  }
}

async function write(io: Io, file: string, data: string | Uint8Array): Promise<void> {
  try {
    await io.writeFile(file, data);
  } catch (e) {
    throw new Error(`cannot write ${file}: ${(e as Error).message}`);
  }
}
