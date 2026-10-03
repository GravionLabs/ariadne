import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { yaml } from '@codemirror/lang-yaml';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { Annotation, EditorState } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { CodeEditor, CodeEditorOptions, minimalChange } from './code-editor';

/** Marks changes that come from outside, so they are not reported as user edits. */
const external = Annotation.define<boolean>();

/** Colours follow the app's tokens, so the editor fits the page (and later the dark theme). */
const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--c-text)',
    backgroundColor: 'var(--c-surface-1)',
    fontSize: '12.5px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    lineHeight: '1.55',
  },
  '.cm-content': { caretColor: 'var(--c-primary)', padding: '8px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--c-primary)' },
  '.cm-gutters': {
    color: 'var(--c-text-subtle)',
    backgroundColor: 'var(--c-surface-2)',
    borderRight: '1px solid var(--c-border)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--c-primary-soft)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--c-surface-3)', color: 'var(--c-text)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--c-primary) 22%, transparent)',
  },
  '.cm-matchingBracket': { backgroundColor: 'var(--c-surface-3)', outline: 'none' },
});

const highlighting = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--c-step)' },
  { tag: [tags.string, tags.content], color: 'var(--c-text)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--c-event)' },
  { tag: tags.comment, color: 'var(--c-text-subtle)', fontStyle: 'italic' },
  { tag: [tags.separator, tags.punctuation, tags.meta], color: 'var(--c-text-subtle)' },
  { tag: tags.keyword, color: 'var(--c-decision)' },
]);

const clampLine = (line: number, lines: number): number => Math.min(Math.max(line, 1), lines);

/** The CodeMirror 6 implementation of {@link CodeEditor}; imported lazily. */
export async function createCodeMirrorEditor(
  parent: HTMLElement,
  options: CodeEditorOptions,
): Promise<CodeEditor> {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineNumbers(),
        lintGutter(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        yaml(),
        syntaxHighlighting(highlighting),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        theme,
        EditorView.contentAttributes.of({
          'aria-label': 'Diagram source (YAML)',
          spellcheck: 'false',
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some((t) => t.annotation(external))) return;
          options.onChange(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          blur: () => {
            options.onBlur();
          },
        }),
      ],
    }),
  });

  return {
    setText(text) {
      const current = view.state.doc.toString();
      if (text === current) return;
      view.dispatch({ changes: minimalChange(current, text), annotations: external.of(true) });
    },
    focus: () => view.focus(),
    showError(error) {
      if (!error) {
        view.dispatch(setDiagnostics(view.state, []));
        return;
      }
      const line = view.state.doc.line(clampLine(error.line, view.state.doc.lines));
      const from = Math.min(line.from + Math.max(error.column - 1, 0), line.to);
      view.dispatch(
        setDiagnostics(view.state, [
          // From the problem to the end of the line: the whole value is underlined.
          { from, to: Math.max(from + 1, line.to), severity: 'error', message: error.message },
        ]),
      );
    },
    reveal(lineNumber, column) {
      const line = view.state.doc.line(clampLine(lineNumber, view.state.doc.lines));
      const pos = Math.min(line.from + Math.max(column - 1, 0), line.to);
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
      });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}
