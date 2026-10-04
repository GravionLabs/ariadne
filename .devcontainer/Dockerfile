# The development image: what the CI jobs need, so tests behave the same here and there.
# Node 24 is what CI uses (GravionLabs/ci/node/setup) and what .nvmrc says. The production
# image (../Dockerfile) and `engines` say 22; they are not changed by this.
FROM mcr.microsoft.com/devcontainers/javascript-node:4-24-bookworm

# xvfb and the libraries Electron needs, for the VS Code integration tests. Debian 13 (trixie) and Ubuntu 24.04 (the CI runner)
# call the sound library libasound2t64.
RUN apt-get update \
    && ALSA="$(apt-cache show libasound2t64 >/dev/null 2>&1 && echo libasound2t64 || echo libasound2)" \
    && apt-get install -y --no-install-recommends \
        xvfb xauth "$ALSA" libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libxkbfile1 \
        libsecret-1-0 libxss1 libdrm2 \
    && rm -rf /var/lib/apt/lists/*

# pnpm through corepack, at the version `packageManager` in package.json pins.
RUN corepack enable
