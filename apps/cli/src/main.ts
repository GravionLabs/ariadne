import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Io, run } from './cli';

const io: Io = {
  readText: (path) => readFile(path, 'utf8'),
  writeFile: async (path, data) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

process.exitCode = await run(process.argv.slice(2), io);
