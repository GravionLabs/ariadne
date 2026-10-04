import * as vscode from 'vscode';

/** One open saga editor, as the extension exports it; see `AriadneApi` in src/extension.ts. */
export interface OpenEditor {
  uri: vscode.Uri;
  session: { receive(data: unknown): void; idle(): PromiseLike<unknown> };
  posted: { type: string; text?: string; kind?: string }[];
}

/** The part of the extension's exports the tests use. */
export interface Api {
  openEditors(): OpenEditor[];
  /** Resolves once the drift service has nothing pending. */
  drift: { idle(): Promise<void> };
  /** Resolves once the Problems panel has no check pending. */
  problems: { idle(): Promise<void> };
}

/** Activates the extension and returns what it exports. */
export async function api(): Promise<Api> {
  const extension = vscode.extensions.getExtension<Api>('gravionlabs.ariadne-vscode')!;
  return extension.activate();
}

/**
 * Waits for a condition, never for a fixed time: polls `probe` until it returns something
 * truthy, and fails with what it was waiting for. Negative checks ("reports nothing") wait for
 * `api.problems.idle()` or `api.drift.idle()` first, then assert.
 */
export async function until<T>(
  what: string,
  probe: () => T | undefined | false | PromiseLike<T | undefined | false>,
  { timeoutMs = 10_000 }: { timeoutMs?: number } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = await probe();
    if (found) return found;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** A minimal diagram with this name. */
export const sample = (name: string): string => `version: 3
name: ${name}
direction: top-bottom
nodes:
  - id: start-1
    type: start
    name: Initial
edges: []
`;
