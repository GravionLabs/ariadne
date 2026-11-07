# Scaffold a standalone component

Scaffold one standalone Angular component.

## Steps

1. Ask: component name (kebab-case), selector prefix, target folder, modules to import
2. Validate: name format, folder exists, which file-naming convention the project uses (see below)
3. Create the `.ts` file with `@Component`: `selector: '<prefix>-<name>'`, `changeDetection: ChangeDetectionStrategy.OnPush`, `templateUrl`, `styleUrl` (singular), imports ordered Angular core → Angular common → third-party → local, empty class. Do not add `standalone: true`, it is the default.
4. Create the `.html` file with a minimal placeholder and an empty `.scss` file
5. Add the export to the nearest `index.ts` or `public-api.ts` if one exists
6. Verify: `ng lint`, `ng build`

## File naming

Match the project's existing convention. New Angular 20+ projects follow the CLI default: no `.component` suffix (`header.ts`, `header.html`, `header.scss`, class `Header`); projects that still use `*.component.ts` keep it (class `HeaderComponent`). Never mix both in one project.

## Constraints

- Always `OnPush`; no NgModules
- Class PascalCase, files kebab-case, class and file names must match
- Selector prefix consistent across the project (taken from the project, e.g. `app-*`)
- Barrel export updated, or the component is not importable from the library

Report: summary, files created/updated, verify commands.
