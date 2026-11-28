# Helix primitives instead of raw controls

For projects whose `package.json` depends on `@gravionlabs/helix-ui`. Selectors and inputs: Helix 22.7.

## Rule

- No raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<progress>` without a Helix directive; take the Helix element of the table.
- No component CSS that styles controls: choose the inputs of the control, and change the look in the theme tokens.

## Mapping

| Need                        | Use                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Primary action              | `button[hx-button]`, one per form or dialog                                                    |
| Secondary action            | `button[hx-button]` with `variant="text"` or `variant="outlined"`                              |
| Destructive action          | `button[hx-button]` with `severity="danger"`, behind `HxConfirmationService` when irreversible |
| Icon-only action            | `button[hx-button]` with `iconOnly`, `aria-label` and `hx-tooltip`                             |
| Busy action                 | `button[hx-button]` with `[loading]`                                                           |
| Text field, multi-line text | `input[hx-input]`, `textarea[hx-input]`, with `aria-invalid` for the invalid state             |
| Checkbox, setting on or off | `input[type="checkbox"][hx-checkbox]`, `input[type="checkbox"][hx-switch]`                     |
| Choice from a list          | `hx-select`                                                                                    |
| Picker (field with button)  | `hx-input-group`                                                                               |
| Error that needs action     | `hx-message` with `severity="error"`                                                           |
| Group of related fields     | `hx-fieldset`                                                                                  |
| Progress                    | `hx-progress-bar`                                                                              |
| Dialog actions              | `hxDialogFooter` inside `hx-dialog`                                                            |

Buttons as list items: until Helix has a list row, use `hx-button variant="text"`.

## Enforcement

The lint preset `@gravionlabs/helix-lint` reports raw controls and raw colors and font sizes: set it up per [style-lint.md](style-lint.md#helix-projects).

## See also

- Skill `ng-helix`: component APIs and form and dialog recipes.
- [Helix UX rules](https://github.com/GravionLabs/helix/blob/main/docs/UX-RULES.md): which element for which feedback, confirm or undo.
- `docs/STYLEGUIDE.md` of the project (skill `ui-styleguide`), when it exists.
