/** Specs of the Angular wrapper `@ariadne/viewer/angular`. They run here, in an Angular project, with the demo app. */
import { HttpRequest } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { type Diagram, type PathStep, serializeDiagram } from '@ariadne/core';
import type {
  SagaEmphasis,
  SagaErrorDetail,
  SagaSelectDetail,
  ViewerFeature,
} from '@ariadne/viewer';
import { AriadneSaga, provideAriadneViewer } from '@ariadne/viewer/angular';

const diagram: Diagram = {
  direction: 'top-bottom',
  name: 'Order',
  nodes: [
    { id: 'start', type: 'start', name: 'Initial' },
    {
      id: 'reserving',
      type: 'state',
      name: 'Reserving stock',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
    },
    { id: 'completed', type: 'end', name: 'Completed' },
  ],
  edges: [
    {
      id: 'e1',
      source: 'start',
      target: 'reserving',
      kind: 'forward',
      event: 'OrderSubmitted',
      eventSource: 'API',
    },
    {
      id: 'e2',
      source: 'reserving',
      target: 'completed',
      kind: 'forward',
      event: 'StockReserved',
      eventSource: 'API',
    },
  ],
};
const yaml = serializeDiagram(diagram);

@Component({
  selector: 'app-test-host',
  imports: [AriadneSaga],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ariadne-saga
      [url]="url()"
      [source]="source()"
      [direction]="direction()"
      [theme]="theme()"
      [features]="features()"
      [emphasis]="emphasis()"
      [path]="path()"
      [showUntaken]="showUntaken()"
      (loaded)="loaded.push($event.diagram.name ?? '')"
      (failed)="failed.push($event)"
      (selected)="selected.push($event)"
      (walkthroughChanged)="walks.push($event.steps)"
      (pathResolved)="resolved.push($event.current ?? '')"
    />
  `,
})
class Host {
  readonly url = signal<string | undefined>(undefined);
  readonly source = signal<string | undefined>(undefined);
  readonly direction = signal<'top-bottom' | 'left-right' | undefined>(undefined);
  readonly theme = signal<'light' | 'dark' | 'auto' | undefined>(undefined);
  readonly features = signal<readonly ViewerFeature[] | undefined>(undefined);
  readonly emphasis = signal<SagaEmphasis | null>(null);
  readonly path = signal<readonly PathStep[] | null>(null);
  readonly showUntaken = signal(false);
  readonly loaded: string[] = [];
  readonly failed: SagaErrorDetail[] = [];
  readonly selected: SagaSelectDetail[] = [];
  readonly walks: string[][] = [];
  readonly resolved: string[] = [];
}

type Element = HTMLElement & { shadowRoot: ShadowRoot };
const settle = () => new Promise((resolve) => setTimeout(resolve));

async function create(
  extra: Parameters<typeof TestBed.configureTestingModule>[0]['providers'] = [],
  httpFeatures: Parameters<typeof provideHttpClient> = [],
): Promise<{
  fixture: ComponentFixture<Host>;
  host: Host;
  el: Element;
  http: HttpTestingController;
}> {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(...httpFeatures),
      provideHttpClientTesting(),
      provideAriadneViewer(),
      ...extra,
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = (fixture.nativeElement as HTMLElement).querySelector('ariadne-saga') as Element;
  return {
    fixture,
    host: fixture.componentInstance,
    el,
    http: TestBed.inject(HttpTestingController),
  };
}
const flush = async (fixture: ComponentFixture<Host>) => {
  fixture.detectChanges();
  await fixture.whenStable();
  await settle();
};
const $ = (el: Element, selector: string) => el.shadowRoot.querySelector<HTMLElement>(selector)!;

describe('provideAriadneViewer', () => {
  it('registers <ariadne-saga> once, in the browser', async () => {
    await create();
    expect(customElements.get('ariadne-saga')).toBeDefined();
    TestBed.resetTestingModule();
    await create(); // a second app: registering again must not throw
    expect(customElements.get('ariadne-saga')).toBeDefined();
  });
});

describe('AriadneSaga', () => {
  it('is the custom element itself, so there is no wrapper in the DOM', async () => {
    const { el } = await create();
    expect(el.tagName).toBe('ARIADNE-SAGA');
    expect(el.shadowRoot).toBeTruthy();
  });

  it('shows a saga given as source and emits loaded', async () => {
    const { fixture, host, el } = await create();
    host.source.set(yaml);
    await flush(fixture);
    expect($(el, 'svg')).toBeTruthy();
    expect($(el, '.name').textContent).toBe('Order');
    expect(host.loaded).toEqual(['Order']);
  });

  it('loads url with the host HttpClient: interceptors apply, and it shows loading meanwhile', async () => {
    const auth = (
      req: HttpRequest<unknown>,
      next: Parameters<Parameters<typeof withInterceptors>[0][number]>[1],
    ) => next(req.clone({ setHeaders: { Authorization: 'Bearer token' } }));
    const { fixture, host, el, http } = await create([], [withInterceptors([auth])]);
    host.url.set('/api/sagas/order.saga.yaml');
    await flush(fixture);
    const request = http.expectOne('/api/sagas/order.saga.yaml');
    expect(request.request.headers.get('Authorization')).toBe('Bearer token');
    expect(request.request.responseType).toBe('text');
    expect($(el, '.status').textContent).toBe('Loading…');
    request.flush(yaml);
    await flush(fixture);
    expect($(el, 'svg')).toBeTruthy();
    expect($(el, '.status').textContent).toBe('');
    expect(host.loaded).toEqual(['Order']);
    http.verify();
  });

  it('never calls fetch for url', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch');
    const { fixture, host, http } = await create();
    host.url.set('/x.saga.yaml');
    await flush(fixture);
    http.expectOne('/x.saga.yaml').flush(yaml);
    await flush(fixture);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it('emits failed for a failed request, an invalid file and a newer version', async () => {
    const { fixture, host, el, http } = await create();
    host.url.set('/missing');
    await flush(fixture);
    http.expectOne('/missing').flush('nope', { status: 404, statusText: 'Not Found' });
    await flush(fixture);
    expect(host.failed.at(-1)).toEqual({
      kind: 'network',
      message: '/missing could not be loaded (404 Not Found).',
    });
    expect($(el, '.status').textContent).toContain('404');

    host.url.set('/offline');
    await flush(fixture);
    http.expectOne('/offline').error(new ProgressEvent('error'));
    await flush(fixture);
    expect(host.failed.at(-1)?.kind).toBe('network');

    host.url.set('/bad');
    await flush(fixture);
    http.expectOne('/bad').flush('version: 3\nnodes: {}');
    await flush(fixture);
    expect(host.failed.at(-1)).toEqual({ kind: 'invalid', message: 'nodes must be a list' });

    host.url.set('/future');
    await flush(fixture);
    http.expectOne('/future').flush('version: 9');
    await flush(fixture);
    expect(host.failed.at(-1)).toMatchObject({ kind: 'version', version: 9 });
    expect(host.failed).toHaveLength(4);
  });

  it('loads again for the same text after an error', async () => {
    const { fixture, host, el, http } = await create();
    host.url.set('/a');
    await flush(fixture);
    http.expectOne('/a').flush(yaml);
    await flush(fixture);
    host.url.set('/b');
    await flush(fixture);
    http.expectOne('/b').flush('', { status: 500, statusText: 'Server Error' });
    await flush(fixture);
    expect($(el, 'svg')).toBeNull();
    host.url.set('/c');
    await flush(fixture);
    http.expectOne('/c').flush(yaml);
    await flush(fixture);
    expect($(el, 'svg')).toBeTruthy();
  });

  it('cancels the request of an old url when the url changes', async () => {
    const { fixture, host, http } = await create();
    host.url.set('/old');
    await flush(fixture);
    const old = http.expectOne('/old');
    host.url.set('/new');
    await flush(fixture);
    expect(old.cancelled).toBe(true);
    http.expectOne('/new').flush(yaml);
    await flush(fixture);
    http.verify();
  });

  it('prefers source over url, and takes over from a url when source is set', async () => {
    const { fixture, host, el, http } = await create();
    host.url.set('/a');
    host.source.set(yaml);
    await flush(fixture);
    http.expectNone('/a');
    expect($(el, 'svg')).toBeTruthy();
  });

  it('passes direction, theme, features, emphasis, path and showUntaken on', async () => {
    const { fixture, host, el } = await create();
    host.source.set(yaml);
    host.direction.set('left-right');
    host.theme.set('dark');
    host.features.set(['walkthrough', 'problems']);
    host.emphasis.set({ nodes: ['Reserving stock'] });
    host.path.set([{ event: 'OrderSubmitted' }]);
    host.showUntaken.set(true);
    await flush(fixture);
    expect(el.getAttribute('direction')).toBe('left-right');
    expect(el.getAttribute('theme')).toBe('dark');
    expect(el.getAttribute('features')).toBe('walkthrough problems');
    expect(el.hasAttribute('show-untaken')).toBe(true);
    expect($(el, '[data-node-id="reserving"]').hasAttribute('data-emphasis')).toBe(true);
    expect($(el, '[data-node-id="reserving"]').getAttribute('data-path')).toBe('current');
    expect(host.resolved).toEqual(['reserving']);

    // the app updates the path as the instance moves on, and the view follows
    host.path.set([{ event: 'OrderSubmitted' }, { event: 'StockReserved' }]);
    await flush(fixture);
    expect($(el, '[data-node-id="completed"]').getAttribute('data-path')).toBe('finished');
    expect(host.resolved).toEqual(['reserving', 'completed']);
    host.theme.set(undefined);
    host.showUntaken.set(false);
    await flush(fixture);
    expect(el.hasAttribute('theme')).toBe(false);
    expect(el.hasAttribute('show-untaken')).toBe(false);
  });

  it('emits selected and walkthroughChanged', async () => {
    const { fixture, host, el } = await create();
    host.source.set(yaml);
    host.features.set(['walkthrough']);
    await flush(fixture);
    $(el, '[data-node-id="reserving"]').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(host.selected.at(-1)?.selection).toMatchObject({ kind: 'node', id: 'reserving' });
    $(el, '[data-feature="walkthrough"]').click();
    $(el, '[data-option]').click();
    expect(host.walks).toEqual([['e1']]);
  });
});

describe('on the server', () => {
  it('renders nothing and loads nothing', async () => {
    const { fixture, host, el, http } = await create([
      { provide: PLATFORM_ID, useValue: 'server' },
    ]);
    host.url.set('/api/saga.yaml');
    host.source.set(yaml);
    await flush(fixture);
    http.expectNone('/api/saga.yaml');
    expect($(el, 'svg')).toBeNull();
    expect(host.loaded).toEqual([]);
  });
});
