# Keyboard shortcuts

| Keys                        | Does                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `Ctrl+O`                    | Open a diagram                                                                                 |
| `Ctrl+S`                    | Save                                                                                           |
| `Ctrl+Shift+S`              | Save as                                                                                        |
| `Ctrl+Z`                    | Undo                                                                                           |
| `Ctrl+Shift+Z`, `Ctrl+Y`    | Redo                                                                                           |
| `Tab`                       | Reach the diagram, then the "+" buttons, the inspector and the toolbar                         |
| Arrow keys (in the diagram) | Move between states and transitions; the diagram scrolls to one that is covered or off screen  |
| `Ctrl`+arrow                | Follow a transition                                                                            |
| `Home`, `End`               | First or last state                                                                            |
| `Ctrl+A`                    | Select everything                                                                              |
| `Esc`                       | Clear the selection                                                                            |
| `F2`                        | Rename the selected state, or edit the event of the selected transition, in place              |
| `N`                         | With a state selected: add a state after it (asks for the event and the name)                  |
| `F`                         | With a state selected: add a final state after it                                              |
| `C`                         | With a state selected: connect it to an existing state (arrows pick the target, `Enter` joins) |
| `E`                         | With a transition selected: edit its event                                                     |
| `Delete`                    | Remove the selection                                                                           |
| `+`, `-`, `0`               | Zoom in, out, reset                                                                            |
| `Enter` on a "+" button     | Open the add prompt                                                                            |
| `Enter` in the add prompt   | Add the state with the event and name typed; `Esc` adds it with the defaults                   |

`N`, `F`, `C` and `E` do nothing while you type in a field, while walking through the saga or viewing a path, or with a
modifier key held.

On macOS, `Cmd` replaces `Ctrl`. Typing in a field keeps its own undo history, so `Ctrl+Z` there does not undo the
diagram. Screen readers hear each state and transition and a live announcement of the selection;
`prefers-reduced-motion` turns the animated fit and centring off.
