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
`;

export const STYLES = `
:host {
  display: block;
  position: relative;
  min-height: 160px;
  color: var(--ariadne-text, #1a1c23);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --ariadne-focus: #6366f1;
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
`;
