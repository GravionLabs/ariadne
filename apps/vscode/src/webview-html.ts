/** The HTML of the webview: the embedded editor's page, or a placeholder when it was not built. */
export interface WebviewHtmlOptions {
  /** `webview.cspSource`. */
  cspSource: string;
  nonce: string;
  title: string;
}

/** Content Security Policy for the webview: only the extension's own files, scripts by nonce. */
export function contentSecurityPolicy({ cspSource, nonce }: WebviewHtmlOptions): string {
  return [
    "default-src 'none'",
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
    `connect-src ${cspSource}`,
  ].join('; ');
}

export function placeholderHtml(options: WebviewHtmlOptions): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(options)}">
<title>${options.title}</title>
</head>
<body>
<p>The Ariadne editor is not part of this build of the extension.</p>
</body>
</html>`;
}

export function createNonce(random: () => number = Math.random): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(random() * chars.length));
  }
  return nonce;
}
