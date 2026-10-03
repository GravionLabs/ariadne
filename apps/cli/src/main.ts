import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCSharpParser } from '@ariadne/masstransit';
import { Io, run } from './cli';

const io: Io = {
  readText: (path) => readFile(path, 'utf8'),
  writeFile: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  // The build copies the grammar and the runtime next to this file.
  csharpParser: async () =>
    createCSharpParser({
      grammar: new Uint8Array(
        await readFile(new URL('./tree-sitter-c_sharp.wasm', import.meta.url)),
      ),
      runtime: fileURLToPath(new URL('./web-tree-sitter.wasm', import.meta.url)),
    }),
};

process.exitCode = await run(process.argv.slice(2), io);
