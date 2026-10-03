# Exports

The **Export** menu in the top bar:

| Entry                        | Result                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- |
| SVG, PNG                     | The diagram as an image (PNG at 2×). Saved through the file dialog.    |
| Copy Mermaid                 | Mermaid state-diagram text on the clipboard.                           |
| Mermaid, Mermaid in Markdown | `.mmd` text, or a fenced block in a `.md` file, for READMEs and wikis. |
| Markdown page                | A page about the saga: states, transitions, messages (`.docs.md`).     |

From the command line, for CI and docs builds:

```sh
ariadne export order.saga.yaml --format svg -o order.svg     # mermaid | svg | png | md
ariadne lint docs/*.saga.yaml --max-warnings 0               # exit code 1 on errors
```

An image export shows the diagram as it is drawn; the title and description come from the saga's details.
