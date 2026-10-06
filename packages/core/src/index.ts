/**
 * @ariadne/core: the domain of Ariadne, without a framework.
 *
 * - `diagram`: the model and what is derived from it (event kinds, join events, labels);
 * - `diagram-yaml`: the file format (read, write, migrate);
 * - `diagram-edits`: pure edits of a diagram (add, connect, retarget, remove, rename details);
 * - `messages`: naming hints for commands and events;
 * - `validation`, `catalog`, `walkthrough`, `path`: what to tell about a diagram, and the path
 *   a saga instance took;
 * - `layout`: where everything goes (dagre), sizes, routes of loops and parallel transitions.
 */
export * from './catalog';
export * from './color';
export * from './diagram';
export * from './diagram-edits';
export * as edits from './diagram-edits';
export * from './diagram-yaml';
export * from './layout';
export * from './messages';
export * from './node-info';
export * from './path';
export * from './suggestions';
export * from './validation';
export * from './walkthrough';
