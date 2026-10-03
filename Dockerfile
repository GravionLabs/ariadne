# Ariadne, self-hosted: the web app and the small Node server that serves it.
#   docker build -t ariadne .
#   docker run -p 8080:8080 ariadne

# ---- build the app and the server
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# The manifests first: the install layer is reused until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/cli/package.json apps/cli/
COPY apps/server/package.json apps/server/
COPY packages/core/package.json packages/core/
COPY packages/export/package.json packages/export/
COPY packages/masstransit/package.json packages/masstransit/
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
# The app bundles the sample sagas.
COPY docs/examples docs/examples
COPY samples/sagas samples/sagas
RUN pnpm --filter @ariadne/web build && pnpm --filter @ariadne/server build

# ---- run: the node binary, the bundled server and the built app, nothing else (no npm, no yarn)
FROM alpine:3.22
RUN apk add --no-cache libstdc++ && adduser -D -u 10001 ariadne
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=build /repo/apps/server/dist/server.mjs ./server.mjs
COPY --from=build /repo/apps/web/dist/ariadne/browser ./web
ENV NODE_ENV=production \
    ARIADNE_ROOT=/app/web \
    PORT=8080
USER ariadne
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.mjs"]
