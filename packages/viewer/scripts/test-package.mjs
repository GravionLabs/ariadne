// Installs the packed tarball into an empty project, as a consumer would, and checks that what was
// packed is enough: the element works in a DOM, importing it without one does not fail (server-side
// rendering), the Angular wrapper is compiled for the consumer's Angular, the one-file bundle runs,
// and nothing refers to the workspace.
//
//   pnpm --filter @ariadne/viewer test:package
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const tarball = readdirSync(resolve(root, 'npm')).find((f) => f.endsWith('.tgz'));
if (!tarball) throw new Error('No tarball in npm/: run `pnpm package` first.');

const project = mkdtempSync(join(tmpdir(), 'ariadne-viewer-'));
const run = (command, args, cwd = project) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
try {
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name: 'consumer', type: 'module' }),
  );
  // `--ignore-workspace`: the project is outside the repository's workspace.
  // The Angular wrapper has Angular as a peer dependency, which the consumer's app provides.
  run('pnpm', [
    'add',
    '--ignore-workspace',
    resolve(root, 'npm', tarball),
    'jsdom',
    'typescript@~6.0.2',
    '@angular/core@^22.2.0',
    '@angular/common@^22.2.0',
    '@angular/compiler@^22.2.0',
    'rxjs@~7.8.0',
  ]);

  const manifest = JSON.parse(
    readFileSync(join(project, 'node_modules/@ariadne/viewer/package.json'), 'utf8'),
  );
  const problems = [];
  if (manifest.dependencies && Object.keys(manifest.dependencies).length) {
    problems.push(`dependencies should be bundled, found ${Object.keys(manifest.dependencies)}`);
  }
  if (JSON.stringify(manifest).includes('workspace:')) problems.push('a workspace: reference');
  if (manifest.private) problems.push('the package is private');
  if (problems.length) throw new Error(problems.join('; '));

  writeFileSync(
    join(project, 'check.mjs'),
    `
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
// Partial declarations are linked by the consumer's Angular build; in plain Node the JIT does it.
import '@angular/compiler';

// 1. Without a DOM (server-side rendering): importing and registering must not throw.
const viewer = await import('@ariadne/viewer');
assert.equal(typeof viewer.defineAriadneSaga, 'function');
assert.equal(typeof viewer.AriadneSagaElement, 'function');
viewer.defineAriadneSaga();
const wrapper = await import('@ariadne/viewer/angular').then(
  (m) => m,
  (e) => { throw new Error('@ariadne/viewer/angular does not load: ' + e.message); },
);
assert.ok(wrapper.AriadneSagaComponent && wrapper.provideAriadneViewer);

// 2. The wrapper is compiled (partial Ivy), not Angular source that needs a JIT compiler to read,
//    and it uses the element through the package's own entry (not a copy of it).
const entry = new URL(import.meta.resolve('@ariadne/viewer/angular'));
const js = readFileSync(entry, 'utf8');
assert.match(js, /ɵɵngDeclareComponent/);
assert.ok(js.includes('from "@ariadne/viewer"'));
assert.ok(existsSync(new URL('./index.d.ts', entry)));
assert.ok(existsSync(new URL(import.meta.resolve('@ariadne/viewer').replace(/index\.js$/, 'index.d.ts'))));

// 3. In a DOM the element shows a saga; the one-file bundle does the same.
const yaml = 'version: 3\\nname: Light\\nnodes:\\n  - { id: s, type: start, name: Off }\\n  - { id: e, type: end, name: On }\\nedges:\\n  - { id: x, source: s, target: e, kind: forward, event: Flipped }\\n';
const bundle = readFileSync(new URL(import.meta.resolve('@ariadne/viewer/ariadne-viewer.js')), 'utf8');
const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
// jsdom lacks structuredClone, which every browser has.
dom.window.structuredClone = structuredClone;
dom.window.eval(bundle.replace(/^export\\s*\\{[^}]*\\};?\\s*$/m, ''));
const element = dom.window.document.createElement('ariadne-saga');
element.setAttribute('source', yaml);
dom.window.document.body.append(element);
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(element.shadowRoot.querySelectorAll('[data-node-id]').length, 2, 'the bundle draws the saga');
assert.equal(element.shadowRoot.querySelector('.name').textContent, 'Light');
console.log('package ok');
`,
  );
  run('node', ['check.mjs']);

  // The types resolve the way a strict ES module consumer's TypeScript does (node16).
  writeFileSync(
    join(project, 'types.ts'),
    `import { defineAriadneSaga, type SagaSelectDetail, type PathStep, type ResolvedPath } from '@ariadne/viewer';
import { AriadneSagaComponent, provideAriadneViewer } from '@ariadne/viewer/angular';

const step: PathStep = { event: 'OrderSubmitted', at: 'now' };
declare const detail: SagaSelectDetail;
declare const resolved: ResolvedPath;
export const used = [defineAriadneSaga, AriadneSagaComponent, provideAriadneViewer, step, detail.selection?.kind, resolved.problems.length];
`,
  );
  writeFileSync(
    join(project, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'node16',
        moduleResolution: 'node16',
        target: 'es2022',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
      },
      files: ['types.ts'],
    }),
  );
  run('pnpm', ['exec', 'tsc', '-p', '.']);
} finally {
  rmSync(project, { recursive: true, force: true });
}
