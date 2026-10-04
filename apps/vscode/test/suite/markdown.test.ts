import * as assert from 'node:assert';
import * as vscode from 'vscode';

const DIAGRAM = `version: 3
name: Order Saga
nodes:
  - id: a
    type: start
    name: Initial
  - id: b
    type: state
    name: Submitted
edges:
  - id: e1
    source: a
    target: b
    kind: forward
    event: OrderSubmitted
    eventSource: Shop
`;

describe('Markdown preview', () => {
  it('is hooked into the Markdown preview of VS Code', () => {
    const { contributes } = vscode.extensions.getExtension(
      'gravionlabs.ariadne-vscode',
    )!.packageJSON;
    assert.strictEqual(contributes['markdown.markdownItPlugins'], true);
  });

  it('renders ```saga blocks as diagrams with the engine of the preview', async () => {
    // The Markdown extension loads ours when it builds its engine.
    const html = await vscode.commands.executeCommand<string>(
      'markdown.api.render',
      'Before\n\n```saga\n' + DIAGRAM + '```\n\nAfter\n',
    );
    assert.match(html, /class="ariadne-saga"/);
    assert.match(html, /alt="Saga diagram: Order Saga"/);
    assert.match(html, /src="data:image\/svg\+xml;base64,/);
    assert.match(html, />Before<\/p>/);
    assert.match(html, />After<\/p>/);
  });

  it('leaves other code blocks as they are', async () => {
    const html = await vscode.commands.executeCommand<string>(
      'markdown.api.render',
      '```yaml\nversion: 3\n```\n',
    );
    assert.match(html, /language-yaml/);
    assert.doesNotMatch(html, /ariadne-saga/);
  });
});
