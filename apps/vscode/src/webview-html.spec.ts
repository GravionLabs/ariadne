import { contentSecurityPolicy, createNonce, placeholderHtml } from './webview-html';

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
