import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

describe('JSON Schema for *.saga.yaml', () => {
  const extension = vscode.extensions.getExtension('gravionlabs.ariadne-vscode')!;
  const contributed = extension.packageJSON.contributes.yamlValidation as {
    fileMatch: string;
    url: string;
  }[];

  it('is contributed for *.saga.yaml', () => {
    assert.deepStrictEqual(
      contributed.map((c) => c.fileMatch),
      ['*.saga.yaml'],
    );
  });

  it('ships the schema of the repository', () => {
    const shipped = path.join(extension.extensionPath, contributed[0]!.url);
    const source = path.resolve(
      extension.extensionPath,
      '..',
      '..',
      'docs',
      'specs',
      'saga.schema.json',
    );
    assert.strictEqual(fs.readFileSync(shipped, 'utf8'), fs.readFileSync(source, 'utf8'));
  });
});
