import * as path from 'node:path';
import { DiagramFormatError, parseDiagram } from '@ariadne/core';
import { renderDiagramSvg } from '@ariadne/export';
import type MarkdownItClass from 'markdown-it';

/** An instance of markdown-it: the preview hands one over. */
type MarkdownIt = InstanceType<typeof MarkdownItClass>;

export interface SagaPluginOptions {
  /** The text of a file, or `undefined` when it cannot be read. */
  readFile(file: string): string | undefined;
  /** Where relative links go when the preview does not say which document it renders. */
  fallbackFolder?: () => string | undefined;
}

const SAGA_FILE = /\.saga\.ya?ml$/i;
const CACHE_SIZE = 50;

/** What the Markdown preview of VS Code passes along with the text. */
interface PreviewEnv {
  currentDocument?: { fsPath?: string };
}

/**
 * Shows saga diagrams in Markdown: a fenced ` ```saga ` block holds the YAML, an image link to a
 * `*.saga.yaml` file shows that file. Both become the diagram as SVG. A diagram that cannot be read
 * is shown as a message in its place, so the rest of the page stays.
 */
export function sagaPlugin(md: MarkdownIt, options: SagaPluginOptions): MarkdownIt {
  // Typing in a preview renders it over and over; the same text gives the same picture.
  const cache = new Map<string, string>();
  const render = (yaml: string): string => {
    const known = cache.get(yaml);
    if (known !== undefined) return known;
    const html = diagramHtml(md, yaml);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
    cache.set(yaml, html);
    return html;
  };

  const fence = md.renderer.rules['fence'];
  md.renderer.rules['fence'] = (tokens, index, opts, env, self) => {
    const token = tokens[index]!;
    if (token.info.trim().split(/\s+/)[0] === 'saga') return render(token.content);
    return fence ? fence(tokens, index, opts, env, self) : self.renderToken(tokens, index, opts);
  };

  const image = md.renderer.rules['image'];
  md.renderer.rules['image'] = (tokens, index, opts, env, self) => {
    const token = tokens[index]!;
    const src = String(token.attrGet('src') ?? '');
    const link = decode(src.split(/[?#]/)[0]!);
    if (!SAGA_FILE.test(link) || /^[a-z][a-z0-9+.-]*:/i.test(link)) {
      return image ? image(tokens, index, opts, env, self) : self.renderToken(tokens, index, opts);
    }
    const document = (env as PreviewEnv | undefined)?.currentDocument?.fsPath;
    const folder = document ? path.dirname(document) : options.fallbackFolder?.();
    const file = folder ? path.resolve(folder, link) : link;
    const yaml = options.readFile(file);
    if (yaml === undefined) return problemHtml(md, `${link} cannot be read.`);
    return render(yaml);
  };
  return md;
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function problemHtml(md: MarkdownIt, message: string): string {
  return `<pre class="ariadne-saga-error" style="color:var(--vscode-errorForeground,#c00);white-space:pre-wrap">Saga diagram: ${md.utils.escapeHtml(message)}</pre>\n`;
}

function diagramHtml(md: MarkdownIt, yaml: string): string {
  try {
    const diagram = parseDiagram(yaml);
    const { svg } = renderDiagramSvg(diagram);
    // An image, not inline SVG: its ids and styles cannot reach the page, and the preview allows it.
    const src = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    const label = md.utils.escapeHtml(
      diagram.name ? `Saga diagram: ${diagram.name}` : 'Saga diagram',
    );
    // The picture has a light palette and no background: it sits on white, also in a dark theme.
    return `<figure class="ariadne-saga" style="margin:1em 0;padding:12px;background:#fff;border-radius:6px;overflow:auto"><img src="${src}" alt="${label}" style="max-width:100%;height:auto"></figure>\n`;
  } catch (e) {
    const detail = e instanceof DiagramFormatError ? e.message : (e as Error).message;
    return problemHtml(md, detail);
  }
}
