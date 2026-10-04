/**
 * The viewer's CSS. Colours are `--ariadne-*` custom properties (the same ones the SVG uses); light
 * values are the fallbacks in the SVG, so only dark needs declaring. A host themes one element with
 * `ariadne-saga { --ariadne-surface: ...; }` or the whole page from an ancestor (light theme).
 */
const DARK = `
  color-scheme: dark;
  --ariadne-bg: #14161c;
  --ariadne-surface: #1c1f27;
  --ariadne-border: #333949;
  --ariadne-line: #6b7388;
  --ariadne-text: #e8eaf0;
  --ariadne-text-subtle: #a0a7bb;
  --ariadne-start: #4ade80;
  --ariadne-step: #60a5fa;
  --ariadne-decision: #a78bfa;
  --ariadne-any: #94a3b8;
  --ariadne-timeout: #fbbf24;
  --ariadne-reply: #34d399;
  --ariadne-composite: #818cf8;
  --ariadne-join: #818cf8;
  --ariadne-fault: #f87171;
  --ariadne-end: #fb7185;
  --ariadne-compensation: #fbbf24;
  --ariadne-command: #60a5fa;
  --ariadne-event: #c084fc;
  --ariadne-external: #2dd4bf;
  --ariadne-palette-red: #f87171;
  --ariadne-palette-orange: #fb923c;
  --ariadne-palette-amber: #facc15;
  --ariadne-palette-green: #4ade80;
  --ariadne-palette-teal: #2dd4bf;
  --ariadne-palette-blue: #60a5fa;
  --ariadne-palette-purple: #a78bfa;
  --ariadne-palette-pink: #f472b6;
  --ariadne-focus: #8b93f8;
  --ariadne-emphasis: #fbbf24;
  --ariadne-path: #60a5fa;
  --ariadne-on-path: #11131a;
`;

export const STYLES = `
:host {
  display: block;
  position: relative;
  min-height: 160px;
  color: var(--ariadne-text, #1a1c23);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --ariadne-focus: #6366f1;
  --ariadne-emphasis: #d97706;
  --ariadne-path: #2563eb;
}
:host([theme='dark']) {${DARK}}
@media (prefers-color-scheme: dark) {
  :host(:not([theme='light']):not([theme='dark'])) {${DARK}}
}
:host([hidden]) { display: none; }

.frame {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: inherit;
  background: var(--ariadne-bg, #f4f5f7);
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 8px;
  overflow: hidden;
}
.header { padding: 10px 14px 0; }
.header[hidden] { display: none; }
.name { margin: 0; font-size: 15px; font-weight: 600; }
.description { margin: 2px 0 0; font-size: 13px; color: var(--ariadne-text-subtle, #6b7086); }

.viewport {
  position: relative;
  flex: 1;
  min-height: 120px;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.viewport.dragging { cursor: grabbing; }
.viewport:focus-visible { outline: 2px solid var(--ariadne-focus); outline-offset: -2px; }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.stage svg { display: block; }
[data-node-id]:focus, [data-edge-id]:focus { outline: none; }
[data-node-id]:focus-visible, [data-edge-id]:focus-visible {
  outline: 2px solid var(--ariadne-focus);
  outline-offset: 2px;
}

.toolbar {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: flex;
  gap: 4px;
}
.toolbar button {
  width: 30px;
  height: 30px;
  font: inherit;
  line-height: 1;
  color: inherit;
  background: var(--ariadne-surface, #ffffff);
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 6px;
  cursor: pointer;
}
.toolbar button:hover { border-color: var(--ariadne-line, #b0b5c3); }
.toolbar button:focus-visible { outline: 2px solid var(--ariadne-focus); outline-offset: 1px; }

.status {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  text-align: center;
  font-size: 14px;
  color: var(--ariadne-text-subtle, #6b7086);
  pointer-events: none;
}
.status:empty { display: none; }
.status[data-state='error'] { color: var(--ariadne-fault, #dc2626); }

.tabs {
  position: absolute;
  left: 10px;
  top: 10px;
  display: flex;
  gap: 4px;
}
.tabs[hidden] { display: none; }
.tabs button, .panel button, .toolbar button {
  font: inherit;
  color: inherit;
}
.tabs button {
  padding: 4px 10px;
  font-size: 13px;
  background: var(--ariadne-surface, #ffffff);
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 6px;
  cursor: pointer;
}
.tabs button[aria-pressed='true'] {
  border-color: var(--ariadne-focus);
  box-shadow: 0 0 0 1px var(--ariadne-focus);
}
.tabs button:focus-visible, .panel button:focus-visible { outline: 2px solid var(--ariadne-focus); outline-offset: 1px; }

.panels {
  position: absolute;
  right: 10px;
  top: 10px;
  bottom: 50px;
  width: min(300px, calc(100% - 20px));
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  pointer-events: none;
}
.panels:empty { display: none; }
.panel {
  max-height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 13px;
  cursor: auto;
  user-select: text;
  pointer-events: auto;
  background: var(--ariadne-surface, #ffffff);
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 8px;
}
.panel h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ariadne-text-subtle, #6b7086); }
.panel ul, .panel ol { margin: 0; padding: 0; list-style: none; }
.panel ol { margin-top: 10px; padding-left: 18px; list-style: decimal; color: var(--ariadne-text-subtle, #6b7086); }
.panel li + li { margin-top: 4px; }
.panel li > button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 6px 8px;
  text-align: left;
  background: none;
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 6px;
  cursor: pointer;
}
.panel li > button:hover:not(:disabled) { border-color: var(--ariadne-line, #b0b5c3); }
.panel li > button:disabled { cursor: default; opacity: 0.7; }
.panel button[aria-pressed='true'] { border-color: var(--ariadne-focus); box-shadow: 0 0 0 1px var(--ariadne-focus); }
.panel .actions { display: flex; gap: 6px; margin-top: 10px; }
.panel .actions button { padding: 3px 10px; background: none; border: 1px solid var(--ariadne-border, #e2e5eb); border-radius: 6px; cursor: pointer; }
.panel .actions button:disabled { opacity: 0.5; cursor: default; }
.panel .current { margin-bottom: 8px; }
.panel .doing, .panel .hint, .panel .message-detail { color: var(--ariadne-text-subtle, #6b7086); font-size: 12px; }
.panel .message-name, .panel .problem-message { font-weight: 500; }
.panel .severity { font-size: 11px; font-weight: 700; text-transform: uppercase; }
.panel [data-severity='error'] .severity { color: var(--ariadne-fault, #dc2626); }
.panel [data-severity='warning'] .severity { color: var(--ariadne-timeout, #d97706); }
.panel [data-severity='info'] .severity { color: var(--ariadne-command, #2563eb); }

/* Marks on the diagram: see applyMarks. */
.stage[data-dim] [data-node-id]:not([data-hl]), .stage[data-dim] [data-edge-id]:not([data-hl]) { opacity: 0.3; }
[data-selected] { filter: drop-shadow(0 0 3px var(--ariadne-focus)); }
[data-emphasis] { filter: drop-shadow(0 0 4px var(--ariadne-emphasis)); }
[data-walk] { filter: drop-shadow(0 0 3px var(--ariadne-start, #22c55e)); }
[data-walk='current'] { filter: drop-shadow(0 0 5px var(--ariadne-start, #22c55e)); }
[data-path] { filter: drop-shadow(0 0 3px var(--ariadne-path, #2563eb)); }
[data-path='current'] { filter: drop-shadow(0 0 6px var(--ariadne-path, #2563eb)); }
[data-path='finished'] { filter: drop-shadow(0 0 6px var(--ariadne-start, #22c55e)); }
[data-path-problem] { filter: drop-shadow(0 0 6px var(--ariadne-fault, #dc2626)); }
[data-message] { filter: drop-shadow(0 0 3px var(--ariadne-event, #9333ea)); }
[data-problem='error'] { filter: drop-shadow(0 0 3px var(--ariadne-fault, #dc2626)); }
[data-problem='warning'] { filter: drop-shadow(0 0 3px var(--ariadne-timeout, #d97706)); }
[data-problem='info'] { filter: drop-shadow(0 0 3px var(--ariadne-command, #2563eb)); }
[data-node-id], [data-edge-id] { cursor: pointer; }

.path-info {
  position: absolute;
  left: 10px;
  bottom: 10px;
  max-width: min(420px, calc(100% - 150px));
  box-sizing: border-box;
  padding: 6px 10px;
  font-size: 12px;
  background: var(--ariadne-surface, #ffffff);
  border: 1px solid var(--ariadne-border, #e2e5eb);
  border-radius: 8px;
}
.path-info[hidden] { display: none; }
.path-info ul { margin: 4px 0 0; padding-left: 16px; color: var(--ariadne-fault, #dc2626); }
.path-info .summary { color: var(--ariadne-text-subtle, #6b7086); }
`;
