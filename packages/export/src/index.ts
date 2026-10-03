/**
 * @ariadne/export: exports of a diagram that need no browser.
 *
 * - `svg`: the diagram as a standalone SVG image;
 * - `mermaid`: a Mermaid `stateDiagram-v2`, bare or in a fenced Markdown block;
 * - `markdown`: a documentation page (diagram, states, transitions, messages).
 *
 * PNG needs a canvas in the browser (the web app) or a rasteriser in Node (the CLI).
 */
export * from './markdown';
export * from './mermaid';
export * from './svg';
