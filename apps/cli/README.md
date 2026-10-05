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
```

`ariadne --help` lists every option. Exit codes: 0 all good, 1 findings, 2 wrong usage or a file that cannot be
read or written.

Licence: MIT. The PNG export uses the DejaVu fonts, which come with their own licence (`dist/DejaVu-LICENSE.txt`).
