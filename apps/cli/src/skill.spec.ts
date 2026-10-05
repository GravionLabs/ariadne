// The agent skill (skills/ariadne/SKILL.md) tells an agent how to call this command.
// These tests keep it honest: every command and option it mentions exists in the usage, and its
// example diagram is a diagram that lints clean. A renamed option fails here, not in an agent's hands.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNodeParser } from '@ariadne/masstransit/node';
import { describe, expect, it } from 'vitest';
import { Io, USAGE, run } from './cli';
import { testFonts } from './test-fonts';

const skill = readFileSync(
  resolve(import.meta.dirname, '../../../skills/ariadne/SKILL.md'),
  'utf8',
);

/** The options of each command as the usage lists them, and the values of `--format`. */
function usage(): Map<string, { options: Set<string>; formats: Set<string> }> {
  const commands = new Map<string, { options: Set<string>; formats: Set<string> }>();
  for (const line of USAGE.split('\n')) {
    const found = /^\s+ariadne (\w+) (.*)$/.exec(line);
    if (!found) continue;
    const options = new Set(found[2].match(/(?<![\w-])--?[a-z][\w-]*/g) ?? []);
    const formats = new Set(/--format ([\w|]+)/.exec(found[2])?.[1].split('|') ?? []);
    commands.set(found[1], { options, formats });
  }
  return commands;
}

/** Every `ariadne …` the skill shows: in code blocks and in inline code (the table). */
function invocations(): string[] {
  const blocks = [...skill.matchAll(/```(?:sh|bash)?\n([\s\S]*?)```/g)].flatMap((m) =>
    m[1].split('\n'),
  );
  const inline = [...skill.matchAll(/`(ariadne [^`]+)`/g)].map((m) => m[1]);
  return [...blocks, ...inline]
    .map((line) => line.replace(/\\\|/g, '|').trim())
    .filter((line) => line.startsWith('ariadne '));
}

describe('the agent skill', () => {
  const commands = usage();

  it('has the frontmatter a skill needs, and says when to use it', () => {
    const front = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? '';
    expect(front).toMatch(/^name: ariadne$/m);
    expect(front).toMatch(/^description: .*MassTransit.*\*\.saga\.yaml/m);
  });

  it('reads the usage of the command', () => {
    expect([...commands.keys()]).toEqual(['lint', 'export', 'generate', 'import', 'diff']);
  });

  it('mentions every command, and only commands and options that exist', () => {
    const lines = invocations();
    expect(lines.length).toBeGreaterThan(8);
    const used = new Set<string>();
    for (const line of lines) {
      // `[--format text|json]` is an option too: the brackets only say it is optional.
      const [, command, ...rest] = line.replace(/[[\]]/g, '').split(/\s+/);
      if (command.startsWith('-')) {
        expect(['--version', '-v', '--help', '-h'], line).toContain(command);
        continue;
      }
      expect([...commands.keys()], line).toContain(command);
      used.add(command);
      const known = commands.get(command)!;
      for (const [i, word] of rest.entries()) {
        if (!/^--?[a-z]/.test(word)) continue;
        expect([...known.options], `${word} in: ${line}`).toContain(word);
        if (word === '--format') {
          for (const value of rest[i + 1].split('|')) {
            expect([...known.formats], `--format ${value} in: ${line}`).toContain(value);
          }
        }
      }
    }
    expect([...used].sort()).toEqual([...commands.keys()].sort());
  });

  it('shows an example diagram that lints without errors or warnings', async () => {
    const yaml = /```yaml\n([\s\S]*?)```/.exec(skill)?.[1];
    expect(yaml).toBeDefined();
    const out: string[] = [];
    const io: Io = {
      readText: async () => yaml!,
      writeFile: async () => {},
      stdout: (text) => out.push(text),
      stderr: (text) => out.push(text),
      csharpParser: createNodeParser,
      pngFonts: testFonts,
    };
    const code = await run(['lint', '--max-warnings', '0', 'example.saga.yaml'], io);
    expect(out.join(''), out.join('')).toMatch(/0 errors, 0 warnings/);
    expect(code).toBe(0);
  });

  it('is where every agent looks for it: skills/<name>/SKILL.md, named like its folder', () => {
    // The Agent Skills convention (agentskills.io), read by `gh skill install`, APM and Copilot.
    expect(/^name: (.+)$/m.exec(skill)?.[1]).toBe('ariadne');
    expect(/^license: /m.test(skill)).toBe(true);
  });

  it('is offered by the Claude Code marketplace of the repository, which is the plugin itself', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const read = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
    const marketplace = read('.claude-plugin/marketplace.json');
    const plugin = read('.claude-plugin/plugin.json');
    expect(marketplace.plugins).toEqual([
      expect.objectContaining({ name: 'ariadne', source: './' }),
    ]);
    expect(plugin.name).toBe('ariadne');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('points to the download that the release attaches', () => {
    expect(skill).toContain(
      'https://github.com/GravionLabs/ariadne/releases/latest/download/ariadne-cli.tgz',
    );
  });
});
