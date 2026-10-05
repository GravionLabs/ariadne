# Coding agents

An AI coding agent can work with saga diagrams the way you do with the command line: check a diagram, draw one
from C#, generate C# from one, compare code and diagram, and look at the picture. Ariadne gives it a **skill**
that explains the `ariadne` command and the file format (see [ADR 0021](../adr/0021-agent-access.md) for why a
skill and not an MCP server).

## Install

1. The command, from the newest release (Node 22 or later):

   ```sh
   npm install -g https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz
   ```

2. The skill, in Claude Code:

   ```text
   /plugin marketplace add GravionLabs/ariadne
   /plugin install ariadne@ariadne
   ```

   Other agents that read skills can use the file directly:
   [`plugins/ariadne/skills/ariadne/SKILL.md`](../../plugins/ariadne/skills/ariadne/SKILL.md).

## What to ask

- "Draw a diagram of `OrderStateMachine` next to the code." The agent imports the C#, lints the result and tells
  you what the diagram leaves out (code in `Then`, for example).
- "Design a saga for a refund with a manual review, then generate the C#." It writes the `*.saga.yaml`, lints it
  until it is clean, looks at the picture, and generates the code into a new folder.
- "Does the diagram still match the code?" It runs `ariadne diff` and lists what differs; it can add the check to
  your CI.

The agent runs the command on your machine, with the permissions you give it; nothing is sent to Ariadne. The
editor ([demo](https://gravionlabs.github.io/ariadne/app/), or the VS Code extension) shows what it wrote.
