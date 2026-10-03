import { contentSecurityPolicy, createNonce, embeddedHtml, placeholderHtml } from './webview-html';

const options = { cspSource: 'vscode-webview://x', nonce: 'abc', title: 'Order' };

describe('webview html', () => {
  it('allows scripts only by nonce', () => {
    const csp = contentSecurityPolicy(options);
    expect(csp).toContain("script-src 'nonce-abc'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("default-src 'none'");
  });

  it('puts the policy and title into the placeholder page', () => {
    const html = placeholderHtml(options);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('<title>Order</title>');
  });

  it('creates a 32 character nonce from letters and digits', () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9]{32}$/);
  });

  it('creates different nonces', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <base href="./"/>
    <link rel="stylesheet" href="styles.css"></head>
  <body>
    <app-root></app-root>
  <script src="main.js" type="module"></script></body>
</html>`;

describe('embeddedHtml', () => {
  const html = embeddedHtml(INDEX, { ...options, baseUri: 'vscode-resource://ext/dist/webview' });

  it('puts the policy before anything else in the head', () => {
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('styles.css'));
  });

  it('resolves files against the webview folder, ending in a slash', () => {
    expect(html).toContain('<base href="vscode-resource://ext/dist/webview/">');
    expect(html).not.toContain('href="./"');
  });

  it('gives every script the nonce and Angular its own', () => {
    expect(html).toContain('<script nonce="abc" src="main.js" type="module">');
    expect(html).toContain('<app-root ngCspNonce="abc">');
  });

  it('keeps a base uri that already ends in a slash', () => {
    const again = embeddedHtml(INDEX, { ...options, baseUri: 'x://y/' });
    expect(again).toContain('<base href="x://y/">');
  });

  it('still carries the policy when the page has no head', () => {
    const bare = embeddedHtml('<app-root></app-root>', { ...options, baseUri: 'x://y' });
    expect(bare).toContain('Content-Security-Policy');
  });
});
