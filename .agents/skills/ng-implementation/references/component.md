# Scaffold a standalone component

Scaffold one standalone Angular component.

## Steps

1. Ask: component name (kebab-case), selector prefix, target folder, modules to import
2. Validate: name format, folder exists, which file naming `angular.json` declares (see below)
3. Create the `.ts` file with `@Component`: `selector: '<prefix>-<name>'`, `changeDetection: ChangeDetectionStrategy.OnPush`, `templateUrl`, `styleUrl` (singular), imports ordered Angular core → Angular common → third-party → local, empty class. Do not add `standalone: true`, it is the default.
4. Create the `.html` file with a minimal placeholder and an empty `.css` file (plain CSS is the default; SCSS only as the exception of `SKILL.md`)
5. Add the export to the nearest `index.ts` or `public-api.ts` if one exists
6. Verify: `ng lint`, `ng build`

## File naming

The rule is "File naming" in `SKILL.md`: `schematics` in `angular.json` decides, not the existing files. For a component: no `type` on `@schematics/angular:component` gives `header.ts`, `header.html`, `header.css`, class `Header`; `"type": "component"` gives `header.component.ts` (and `.html`, `.css`), class `HeaderComponent` (`Header` with `"addTypeToClassName": false`). Drift, name collisions and renames: as stated there.

## Constraints

- Always `OnPush`; no NgModules
- Class PascalCase, files kebab-case, class and file names must match
- Selector prefix consistent across the project (taken from the project, e.g. `app-*`)
- Barrel export updated, or the component is not importable from the library

Report: summary, files created/updated, verify commands.
