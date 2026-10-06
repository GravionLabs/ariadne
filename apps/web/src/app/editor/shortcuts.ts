/** One row of the shortcuts list, as it is in `docs/guide/shortcuts.md` (a test keeps the two alike). */
export interface Shortcut {
  /** The keys, without markdown: `Ctrl+Shift+Z, Ctrl+Y`. Alternatives are separated by a comma. */
  keys: string;
  does: string;
}

export interface ShortcutGroup {
  title: string;
  shortcuts: readonly Shortcut[];
}

/** What the "?" button shows. Plain text: the same words as the guide, without its backticks. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'File',
    shortcuts: [
      { keys: 'Ctrl+O', does: 'Open a diagram' },
      { keys: 'Ctrl+S', does: 'Save' },
      { keys: 'Ctrl+Shift+S', does: 'Save as' },
    ],
  },
  {
    title: 'Edit',
    shortcuts: [
      { keys: 'Ctrl+Z', does: 'Undo' },
      { keys: 'Ctrl+Shift+Z, Ctrl+Y', does: 'Redo' },
      { keys: 'Delete', does: 'Remove the selection' },
    ],
  },
  {
    title: 'Move around',
    shortcuts: [
      {
        keys: 'Tab',
        does: 'Reach the diagram, then the "+" buttons, the inspector and the toolbar',
      },
      {
        keys: 'Arrow keys (in the diagram)',
        does: 'Move between states and transitions; the diagram scrolls to one that is covered or off screen',
      },
      { keys: 'Ctrl+arrow', does: 'Follow a transition' },
      { keys: 'Home, End', does: 'First or last state' },
      { keys: 'Ctrl+A', does: 'Select everything' },
      { keys: 'Esc', does: 'Clear the selection' },
      { keys: '+, -, 0', does: 'Zoom in, out, reset' },
    ],
  },
  {
    title: 'Add and edit',
    shortcuts: [
      {
        keys: 'F2',
        does: 'Rename the selected state, or edit the event of the selected transition, in place',
      },
      {
        keys: 'N',
        does: 'With a state selected: add a state after it (asks for the event and the name)',
      },
      { keys: 'F', does: 'With a state selected: add a final state after it' },
      {
        keys: 'C',
        does: 'With a state selected: connect it to an existing state (arrows pick the target, Enter joins)',
      },
      { keys: 'E', does: 'With a transition selected: edit its event' },
      { keys: 'Enter on a "+" button', does: 'Open the add prompt' },
      {
        keys: 'Enter in the add prompt',
        does: 'Add the state with the event and name typed; Esc adds it with the defaults',
      },
    ],
  },
  {
    title: 'Help',
    shortcuts: [{ keys: '?', does: 'Show these shortcuts' }],
  },
];

/**
 * The keys as separate caps: alternatives are split at the comma, and a part with a space in it
 * (`Enter on a "+" button`) is a sentence, not a key.
 */
export function keyParts(keys: string): { text: string; cap: boolean }[] {
  return keys.split(', ').map((text) => ({ text, cap: !text.includes(' ') }));
}
