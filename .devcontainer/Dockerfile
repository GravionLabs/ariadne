# The development image: what the CI jobs need, so tests behave the same here and there.
# Node 26 is what CI uses (GravionLabs/ci/node/setup) and what .nvmrc says. The production
# image (../Dockerfile) is on Node 26 too, and `engines` say >=26.
FROM mcr.microsoft.com/devcontainers/javascript-node:5-26-trixie

# xvfb and the libraries Electron needs, for the VS Code integration tests. Debian 13 (trixie) and Ubuntu 24.04 (the CI runner)
# call the sound library libasound2t64.
RUN apt-get update \
    && ALSA="$(apt-cache show libasound2t64 >/dev/null 2>&1 && echo libasound2t64 || echo libasound2)" \
    && apt-get install -y --no-install-recommends \
        xvfb xauth "$ALSA" libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libxkbfile1 \
        libsecret-1-0 libxss1 libdrm2 \
    && rm -rf /var/lib/apt/lists/*

# pnpm through corepack, at the version `packageManager` in package.json pins. Node.js 26 images do not bundle
# corepack: it is installed at an exact version, which Renovate keeps current (customManagers in .github/renovate.json5).
# renovate: datasource=npm depName=corepack
ARG COREPACK_VERSION=0.36.0
# --force: the base image already ships a pnpm shim in the global npm bin, and without it npm stops with EEXIST;
# corepack then takes the pnpm and pnpx names over.
RUN npm install -g --force corepack@${COREPACK_VERSION} && corepack enable
