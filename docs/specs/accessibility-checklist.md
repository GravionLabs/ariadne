# Accessibility: manual test checklist

What the automated checks cannot do: use Ariadne the way a person who does not use a mouse, or does not see the
screen, would. Run it before a release that changes the editor, and record the result in the table at the end. The
target and the automated checks are in the [accessibility statement](../guide/accessibility.md).

How to run each walkthrough, for every environment below:

- **Keyboard only.** Unplug the mouse or do not touch it. Every step must be possible; the focus must always be
  visible, and never hidden behind a panel.
- **Screen reader.** Close your eyes or turn the screen off. Every step must be possible from what is spoken.
  Environments: NVDA with Firefox and with Chrome on Windows, VoiceOver with Safari on macOS.
- **VS Code high contrast.** In the VS Code webview (open a `*.saga.yaml` in the extension), with the themes
  "High Contrast" and "High Contrast Light" (Command Palette → _Preferences: Color Theme_). Look for anything that
  disappears, anything that cannot be told from its surroundings, and a focus ring that cannot be seen.

Write down what you hear or see where it differs from the expected result, and open an issue for each difference.
**A step that was not run is not marked as passed.**

## 1. Build a saga from scratch

Environment: the web editor (`pnpm start`), then the VS Code webview.

| #   | Step                                                                     | Expect                                                                                                                            |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the editor and press `Tab` until you reach **New**; press `Enter`.  | A dialog named "New saga" opens and focus is inside it, on the first field.                                                       |
| 2   | Type a name, `Tab` to **Create**, press `Enter`.                         | The dialog closes. Focus returns to the page (not to nothing). The diagram shows the initial state.                               |
| 3   | `Tab` to the diagram.                                                    | One stop for the whole diagram. Its name ("Saga diagram") and that it is an application are spoken; the focus ring is visible.    |
| 4   | `Tab` to **Add the next state** and press `Enter`.                       | A picker opens with the kinds of state; the options are spoken by name. `Esc` closes it and returns focus to the button.          |
| 5   | Choose **State**.                                                        | A new state appears, is selected, and the inspector opens ("State settings"). The selection is announced.                         |
| 6   | `Tab` into the inspector and give the state a name and a command.        | Every field is spoken with its label. Changing a field is reflected in the diagram; the new name is what is spoken for the state. |
| 7   | Return to the diagram and use the arrow keys to select the transition.   | The transition is announced by its two ends and its event ("Transition from … to …"). The inspector shows "Transition settings".  |
| 8   | Give the transition an event; add a transition **To an existing state**. | The select lists the states by name; choosing one makes a loop; the number of transitions in the inspector grows by one.          |
| 9   | Press `Ctrl+S`.                                                          | The file is saved (or the download starts). A status or the changed title says so; the unsaved mark is gone.                      |
| 10  | With a state far from the others selected, zoom in with `+`.             | The diagram zooms; the selected state stays in view, not behind the inspector.                                                    |

## 2. Import C#

Environment: the web editor.

| #   | Step                                                         | Expect                                                                                                                                                                            |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reach **Import C#…** and press `Enter`; choose a `.cs` file. | The file dialog of the system opens (its accessibility is the system's); after choosing, the import dialog opens with focus in it.                                                |
| 2   | Read the result.                                             | The dialog is named "Import from C#". The sagas found and each warning (the "Warnings" section) are available as text, with the file and line; nothing is only shown as a colour. |
| 3   | Choose a saga and confirm.                                   | The dialog closes; the saga is shown as an unsaved diagram; focus is on the page.                                                                                                 |
| 4   | Reach **Generate C#…**.                                      | A dialog shows the files; the files can be switched between and **Copy file** can be reached and used.                                                                            |

## 3. Export SVG, PNG and Markdown

Environment: the web editor, then **Ariadne: Export Diagram…** in VS Code.

| #   | Step                                                      | Expect                                                                                                                                                         |
| --- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reach **Export** and press `Enter`.                       | A menu opens; focus moves to its first item; `Up` and `Down` move between items; the groups (Image, Mermaid, Documentation) are spoken; `Esc` closes it.       |
| 2   | Export SVG and open it in a browser with a screen reader. | The picture is announced with its title (the saga's name or "Saga diagram") and a description such as "5 states and 7 transitions, from Initial to Completed". |
| 3   | Export the Markdown page and open it.                     | Headings and tables are navigable; each table has column headers; the Mermaid diagram (on GitHub) has a title and description.                                 |
| 4   | Export PNG.                                               | The file is saved. It has no text alternative: this is documented, and the page says what to use instead.                                                      |

## 4. Walk through a saga

Environment: the web editor, then the VS Code webview.

| #   | Step                                                                      | Expect                                                                                                                                                       |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Load the order sample and press **Walkthrough**.                          | The panel opens; the button says it is pressed; the current state and the events it can receive are spoken.                                                  |
| 2   | Choose an event.                                                          | The walk moves on; the new state is spoken or shown in the panel's text, and it is in view, not behind the panel.                                            |
| 3   | Use **Back** and **Restart**, then close the panel with its close button. | Each does what it says; focus does not get lost; the diagram can be edited again.                                                                            |
| 4   | Open **Path**, paste a path (`- OrderReceived`, `- StockReserved`).       | The "Result" (the states visited, and any problem with the path) is available as text and is announced as a status, not only shown as colour on the diagram. |

## Results

Add a row for each environment you ran, with the steps that did not match. _Nothing is written here that was not
tested._

| Date | Tester | Environment (OS, browser or VS Code, assistive technology, theme) | Walkthroughs run | Result | Issues |
| ---- | ------ | ----------------------------------------------------------------- | ---------------- | ------ | ------ |
|      |        |                                                                   |                  |        |        |
