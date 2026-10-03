/**
 * The message protocol between the extension host and the editor in the webview
 * (docs/specs/vscode-protocol.md). Every message is a plain object with `v` (the protocol version)
 * and `type`; anything else is ignored, so a stray message from another script cannot do harm.
 */
export const PROTOCOL_VERSION = 1;

/** VS Code's theme kinds, as the editor's themes know them. */
export type ThemeKind = 'light' | 'dark' | 'high-contrast' | 'high-contrast-light';

export const THEME_KINDS: readonly ThemeKind[] = [
  'light',
  'dark',
  'high-contrast',
  'high-contrast-light',
];

/** Formats the host can ask the editor to render. */
export type ExportFormat = 'svg' | 'png';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['svg', 'png'];

/** Settings of the extension that the editor needs (`ariadne.editor.*`). */
export interface EditorSettings {
  autoLayout: boolean;
}

export const DEFAULT_SETTINGS: EditorSettings = { autoLayout: true };

/** What "Go to code" is asked for: a state or a transition of the diagram, by its id. */
export interface CodeTarget {
  kind: 'state' | 'transition';
  id: string;
}

/** Host → editor. */
export type HostMessage =
  /** The document to show, the theme and the settings; the answer to `ready`. */
  | { v: 1; type: 'init'; text: string; theme: ThemeKind; settings: EditorSettings }
  /** The document text changed outside the editor (text editor, git, undo, revert). */
  | { v: 1; type: 'documentChanged'; text: string }
  | { v: 1; type: 'theme'; kind: ThemeKind }
  /** Render the diagram; the answer is defined with the export commands. */
  | { v: 1; type: 'requestExport'; format: ExportFormat };

/** Editor → host. */
export type EditorMessage =
  /** The editor is loaded and waits for `init`. */
  | { v: 1; type: 'ready' }
  /** The user changed the diagram; `text` is the whole new document (deterministic YAML). */
  | { v: 1; type: 'edit'; text: string }
  /** Something the user should know, e.g. the document cannot be read. */
  | { v: 1; type: 'error'; message: string }
  /** The user wants to see the document as text ("Open as text"). */
  | { v: 1; type: 'showAsText' }
  /** The user wants to see a state or transition in the C# the diagram names (`saga.source`). */
  | { v: 1; type: 'goToCode'; target: CodeTarget };

export type Message = HostMessage | EditorMessage;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTheme = (value: unknown): value is ThemeKind =>
  typeof value === 'string' && (THEME_KINDS as readonly string[]).includes(value);

const isFormat = (value: unknown): value is ExportFormat =>
  typeof value === 'string' && (EXPORT_FORMATS as readonly string[]).includes(value);

function readSettings(value: unknown): EditorSettings {
  const settings = isObject(value) ? value : {};
  return {
    autoLayout:
      typeof settings['autoLayout'] === 'boolean'
        ? settings['autoLayout']
        : DEFAULT_SETTINGS.autoLayout,
  };
}

/** A message from the host, or `null` if `data` is not one (wrong shape, other version). */
export function parseHostMessage(data: unknown): HostMessage | null {
  if (!isObject(data) || data['v'] !== PROTOCOL_VERSION) return null;
  switch (data['type']) {
    case 'init':
      return typeof data['text'] === 'string' && isTheme(data['theme'])
        ? {
            v: 1,
            type: 'init',
            text: data['text'],
            theme: data['theme'],
            settings: readSettings(data['settings']),
          }
        : null;
    case 'documentChanged':
      return typeof data['text'] === 'string'
        ? { v: 1, type: 'documentChanged', text: data['text'] }
        : null;
    case 'theme':
      return isTheme(data['kind']) ? { v: 1, type: 'theme', kind: data['kind'] } : null;
    case 'requestExport':
      return isFormat(data['format'])
        ? { v: 1, type: 'requestExport', format: data['format'] }
        : null;
    default:
      return null;
  }
}

/** A message from the editor, or `null` if `data` is not one. */
export function parseEditorMessage(data: unknown): EditorMessage | null {
  if (!isObject(data) || data['v'] !== PROTOCOL_VERSION) return null;
  switch (data['type']) {
    case 'ready':
      return { v: 1, type: 'ready' };
    case 'showAsText':
      return { v: 1, type: 'showAsText' };
    case 'goToCode': {
      const target = data['target'];
      return isObject(target) &&
        (target['kind'] === 'state' || target['kind'] === 'transition') &&
        typeof target['id'] === 'string'
        ? { v: 1, type: 'goToCode', target: { kind: target['kind'], id: target['id'] } }
        : null;
    }
    case 'edit':
      return typeof data['text'] === 'string' ? { v: 1, type: 'edit', text: data['text'] } : null;
    case 'error':
      return typeof data['message'] === 'string'
        ? { v: 1, type: 'error', message: data['message'] }
        : null;
    default:
      return null;
  }
}
