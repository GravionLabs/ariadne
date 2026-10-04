import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PLATFORM_ID,
} from '@angular/core';
import type {
  AriadneSagaElement,
  PathStep,
  ResolvedPath,
  SagaEmphasis,
  SagaErrorDetail,
  SagaLoadDetail,
  SagaSelectDetail,
  SagaSelection,
  SagaWalkDetail,
  ViewerDirection,
  ViewerFeature,
  ViewerTheme,
} from '@ariadne/viewer';

/**
 * `<ariadne-saga>` in Angular templates: the viewer's custom element with signal inputs and outputs.
 * The component's host *is* the element (register it once with `provideAriadneViewer()`), so there is
 * no wrapper element in the DOM.
 *
 * `url` is loaded with the host's `HttpClient` (interceptors, auth and base URLs apply), `source` is
 * the YAML text; `source` wins when both are set. On the server nothing is rendered or loaded; the
 * browser fills the element in after hydration.
 */
@Component({
  selector: 'ariadne-saga',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AriadneSaga {
  private readonly element = inject<ElementRef<AriadneSagaElement>>(ElementRef).nativeElement;
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Where to load the `.saga.yaml` from, with `HttpClient`. */
  readonly url = input<string>();
  /** The saga as YAML text. */
  readonly source = input<string>();
  /** Overrides the direction of the file. */
  readonly direction = input<ViewerDirection>();
  readonly theme = input<ViewerTheme>();
  /** Opt-in extras: `walkthrough`, `messages`, `problems`. */
  readonly features = input<readonly ViewerFeature[]>();
  /** States (id or name) and transitions (id) to pick out, e.g. where a running instance is. */
  readonly emphasis = input<SagaEmphasis | null>();
  /** The picked state or transition (setting it does not emit `selected`). */
  readonly selection = input<SagaSelection | null>();
  /** The steps a saga instance took; drawn on the diagram, updated as the instance moves on. */
  readonly path = input<readonly PathStep[] | null>();
  /** Keep what the path did not take at full strength. */
  readonly showUntaken = input(false, { transform: booleanAttribute });

  /** The saga was read and drawn. */
  readonly loaded = output<SagaLoadDetail>();
  /** Nothing is shown: a failed request, an invalid file, or a newer format version. */
  readonly failed = output<SagaErrorDetail>();
  /** The user picked a state or transition, or cleared the selection. */
  readonly selected = output<SagaSelectDetail>();
  /** The walkthrough moved: its transitions and states. */
  readonly walkthroughChanged = output<SagaWalkDetail>();
  /** The `path` was resolved against the diagram: the transitions and the problems found. */
  readonly pathResolved = output<ResolvedPath>();

  constructor() {
    if (!this.browser) return;
    const el = this.element;
    const forward = <T>(type: string, emit: (detail: T) => void) =>
      el.addEventListener(type, (event) => emit((event as CustomEvent<T>).detail));
    forward('load', (d: SagaLoadDetail) => this.loaded.emit(d));
    forward('error', (d: SagaErrorDetail) => this.failed.emit(d));
    forward('select', (d: SagaSelectDetail) => this.selected.emit(d));
    forward('walkthrough', (d: SagaWalkDetail) => this.walkthroughChanged.emit(d));
    forward('pathresolved', (d: ResolvedPath) => this.pathResolved.emit(d));

    effect(() => (el.direction = this.direction() ?? null));
    effect(() => (el.theme = this.theme() ?? null));
    effect(() => (el.features = this.features() ?? null));
    effect(() => (el.emphasis = this.emphasis() ?? null));
    effect(() => {
      const selection = this.selection();
      if (selection !== undefined) el.selection = selection;
    });
    effect(() => (el.path = this.path() ?? null));
    effect(() => (el.showUntaken = this.showUntaken()));

    effect((onCleanup) => {
      const source = this.source();
      const url = this.url();
      if (source != null) {
        el.source = source;
        return;
      }
      el.source = null;
      if (!url) return;
      el.showLoading();
      const request = this.http.get(url, { responseType: 'text' }).subscribe({
        next: (text) => (el.source = text),
        error: (e: HttpErrorResponse) =>
          el.showError({
            kind: 'network',
            message: e.status
              ? `${url} could not be loaded (${`${e.status} ${e.statusText}`.trim()}).`
              : `${url} could not be loaded: ${e.message}`,
          }),
      });
      onCleanup(() => request.unsubscribe());
    });
  }
}
