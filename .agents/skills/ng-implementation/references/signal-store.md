# Scaffold an NgRx Signal Store

Scaffold NgRx Signal Store for Angular feature state.

## Steps

1. Ask: feature name, state shape (fields + types + defaults), scope (`root` or feature), async operations needed
2. Create `<feature>.models.ts` with state interface and supporting types
3. Create `<feature>.store.ts`:

   ```typescript
   export const <Feature>Store = signalStore(
     { providedIn: 'root' },
     withState<FeatureState>(initialState),
     withComputed((store) => ({...})),
     withMethods((store) => ({...})),
     withHooks({ onInit(store) {...} })
   );
   ```
4. For async: use `rxMethod` or `patchState` with loading/error state fields
5. Register in component or feature providers as needed

## Constraints

- Use `@ngrx/signals` — not `@ngrx/store`
- Keep store files focused on a single feature slice
- Prefer `withComputed` for derived values over manual subscriptions
- Export store type: `type <Feature>Store = InstanceType<typeof <Feature>Store>`
