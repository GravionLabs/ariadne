# Dev container

A container with everything the CI jobs need: Node 24 (as `.nvmrc` and CI), pnpm through corepack
at the version `package.json` pins, the .NET 8 SDK for the generated-C# check, and xvfb with the
libraries Electron needs for the VS Code integration tests. `pnpm install --frozen-lockfile` runs
when the container is created.

- **VS Code:** install the Dev Containers extension, then **Dev Containers: Reopen in Container**.
- **GitHub Codespaces:** **Code → Codespaces → Create codespace** on the repository.
- **Without an editor:** `pnpm --filter ariadne-vscode test:integration:container` builds the
  `Dockerfile` here and runs the VS Code integration tests in it (see `apps/vscode/DEVELOPING.md`).

Ports 4200 (`pnpm start`) and 8080 (the server) are forwarded. `node_modules` of every project is
in a Docker volume; when you add a project to the workspace, add its volume to `devcontainer.json`.
The production image (`../Dockerfile`) is separate and is not changed by this container.
