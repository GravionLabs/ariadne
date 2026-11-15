# ariadne: the command line of Ariadne

Check, export and convert [MassTransit](https://masstransit.io) saga diagrams (`*.saga.yaml`) to and from C#,
locally and in CI. Documentation: <https://gravionlabs.github.io/ariadne/>.

## Install

Node 22 or later. The newest release:

```sh
npm install -g https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz
# or: pnpm add -g https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz
```

A given version: `…/releases/download/v<version>/ariadne-cli-<version>.tgz`.

## Use

```sh
ariadne lint docs/*.saga.yaml                        # exit 1 on errors
ariadne lint --format json --max-warnings 0 order.saga.yaml
ariadne export order.saga.yaml --format svg -o order.svg   # mermaid | svg | png | md
ariadne generate order.saga.yaml -o src/Orders       # diagram -> C#
ariadne import src/Orders/*.cs -o docs               # C# -> diagram
ariadne diff docs/order.saga.yaml src/Orders/*.cs    # exit 1 when they differ
ariadne convert docs/order.saga.yaml --to json       # writes docs/order.saga.json, keeps the source
curl https://host/sagas/order | ariadne convert - --to yaml -o docs/order.saga.yaml
ariadne convert order.saga.json --to yaml --merge    # keep descriptions, colors, eventSource, ... in order.saga.yaml
```

Every command that reads a diagram takes `*.saga.yaml` and `*.saga.json`, and `-` for the standard input.
`convert` never overwrites a target without `--force`; `--merge` writes over it and keeps what a person wrote
there (the rules are in `docs/specs/diagram-merge.md`), listing the elements that are gone on the standard
error. `import --format json` writes `*.saga.json` instead of `*.saga.yaml`.

`ariadne --help` lists every option. Exit codes: 0 all good, 1 findings, 2 wrong usage or a file that cannot be
read or written.

Licence: MIT. The PNG export uses the DejaVu fonts, which come with their own licence (`dist/DejaVu-LICENSE.txt`).
