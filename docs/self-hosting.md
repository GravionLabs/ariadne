# Self-hosting Ariadne

Ariadne is a static web app plus a small Node server. The server only serves the built app, a
`/config.json` and a `/health` check. It stores nothing: diagrams are files on the user's machine or in
their repository, and importing C# happens in the browser, so source code never reaches the server.

## Run the image

```sh
docker run -d --name ariadne -p 8080:8080 ghcr.io/gravionlabs/ariadne:latest
```

Open <http://localhost:8080>. The image is tagged with the version (`1.0.0`, `1.0`) and `latest`.

With Docker Compose, use [`compose.yaml`](../compose.yaml) from this repository:

```sh
docker compose up -d
```

The container runs as a non-root user and works with a read-only file system and no capabilities (both are
set in `compose.yaml`). It is about 55 MB to pull and 200 MB on disk, most of it the Node.js binary.

## Settings

| Variable         | Default    | Meaning                                                                                |
| ---------------- | ---------- | -------------------------------------------------------------------------------------- |
| `PORT`           | `8080`     | Port the server listens on.                                                            |
| `HOST`           | `0.0.0.0`  | Address the server listens on.                                                         |
| `ARIADNE_ROOT`   | `/app/web` | Folder of the built app. Only needed when running the server without the image.        |
| `ARIADNE_CONFIG` | `{}`       | A JSON object, served as `GET /config.json`: runtime settings for the app, e.g. flags. |

## Endpoints

| Path               | Answer                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| `GET /health`      | `{"status":"ok"}`. Used by the image's health check; also for a load balancer.        |
| `GET /config.json` | The value of `ARIADNE_CONFIG`; never cached.                                          |
| anything else      | A file of the app, or `index.html` for the app's own routes. A missing file is a 404. |

Files with a content hash in their name are cached for a year, the rest is revalidated with an ETag. Answers
are gzip-compressed when the browser accepts it (the C# grammar is 5 MB, 320 kB compressed).

## Behind a proxy

Put TLS and authentication in front of the container (a reverse proxy or your platform's ingress); the server
does neither. Keep the headers it sets. In particular the `Content-Security-Policy` allows scripts from the same
origin, WebAssembly (`'wasm-unsafe-eval'`, for the C# parser) and the inline script of `index.html` by its hash.
If the proxy adds its own policy, it must allow the same.

## Run without Docker

```sh
pnpm install
pnpm --filter @ariadne/web build
pnpm --filter @ariadne/server build
ARIADNE_ROOT=apps/web/dist/ariadne/browser node apps/server/dist/server.mjs
```

Node 22 or later.

## Build the image yourself

```sh
docker build -t ariadne .
```

The image is published by the `Container` workflow when a tag `vX.Y.Z` is pushed; pull requests that change the
Dockerfile or the server build the image and check `/health`.
