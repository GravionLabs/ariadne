/**
 * @ariadne/export: exports of a diagram that need no browser.
 *
 * - `svg`: the diagram as a standalone SVG image;
 * - `mermaid`: a Mermaid `stateDiagram-v2`, bare or in a fenced Markdown block;
 * - `markdown`: a documentation page (diagram, states, transitions, messages);
 * - `describe`: the text alternative of a picture of the diagram (what it is made of, in a sentence);
 * - `png-size`: how large a PNG may be, and the pixel ratio that keeps it within that.
 *
 * PNG needs a canvas in the browser (the web app) or a rasteriser in Node (the CLI).
 */
export * from './markdown';
export * from './mermaid';
export * from './svg';
export * from './png-size';
export * from './describe';
