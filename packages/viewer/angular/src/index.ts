/**
 * @ariadne/viewer/angular: the `<ariadne-saga>` viewer for Angular apps.
 *
 * ```ts
 * bootstrapApplication(App, { providers: [provideHttpClient(), provideAriadneViewer()] });
 * ```
 * ```html
 * <ariadne-saga url="/api/sagas/order.saga.yaml" [features]="['walkthrough']" />
 * ```
 */
export { AriadneSagaComponent } from './saga.component';
export { provideAriadneViewer } from './provide-viewer';
