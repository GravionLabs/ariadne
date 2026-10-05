# ADR 0021: Agents use Ariadne through a skill over the CLI, not an MCP server

- Status: accepted
- Date: 2026-10-05
- Issues: #380, #381, #382, #383, #384, #385
- Builds on: [ADR 0013](0013-csharp-generation.md), [ADR 0019](0019-dependency-updates-and-supply-chain.md)

## Context

AI coding agents work in the repositories where sagas are written. They should be able to do what a developer
does with Ariadne: check a diagram, draw one from C#, generate C# from one, see whether code and diagram still
agree, and look at the picture. The `ariadne` CLI already does all of this (`lint`, `import`, `generate`, `diff`,
`export`), with exit codes and messages meant for CI. Two ways to give it to an agent:

|                         | Skill over the CLI                                                             | MCP server                                                                             |
| ----------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **Who can use it**      | agents with a shell that load skills: Claude Code, the Agent SDK               | any MCP client, also without a shell (Claude Desktop, IDE assistants)                  |
| **What the agent gets** | the CLI's text, JSON (`lint --format json`) and files; a PNG it can open       | typed tools; images as tool results                                                    |
| **Install**             | the CLI (a release download, #385) and the skill (a plugin of this repository) | a server the client starts; it has to be built, released and configured per client     |
| **Safety**              | the agent's own permission rules for shell commands and files                  | the server decides which folders (MCP roots); the client asks per tool                 |
| **Cost**                | one Markdown file, checked against the CLI in CI                               | a new app (`apps/mcp`): its tools, tests, release, and keeping it in step with the CLI |

The people who model MassTransit sagas work in a code editor with an agent that has a shell; the C# and the
diagrams are files in their repository. Nothing the agent needs requires a tool call that a shell command cannot
make.

## Decision

- **A skill**, `ariadne`, teaches an agent the commands, how to read their output and exit codes, and the rules of
  the file format. It is a Claude Code plugin in this repository (`plugins/ariadne`, listed in
  `.claude-plugin/marketplace.json`), so it is installed with `/plugin marketplace add GravionLabs/ariadne`.
- **The CLI is attached to every GitHub release** (`ariadne-cli.tgz`, #385), so the skill can say how to install it
  without a clone: `npm install -g https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz`.
- **The commands in the skill are tested** against the CLI's own usage text, so a renamed command or option fails CI
  instead of misleading an agent.
- **No MCP server** for now: #384 is closed as not planned.

## Consequences

- Agents without a shell cannot use Ariadne. If that is asked for, an MCP server over the same packages is the
  answer (#384 has the acceptance criteria); this ADR is then superseded, the skill stays.
- The skill is only as good as the CLI's messages; improving them improves both.
- The CLI becomes something users install: its version is the release's, and its manifest must not need the
  workspace (checked by `test:package`).
