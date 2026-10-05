import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Direction, Spacing } from '@ariadne/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon, IconName } from './icon';

const DIRECTIONS: readonly { id: Direction; label: string; icon: IconName }[] = [
  { id: 'top-bottom', label: 'Top to bottom', icon: 'directionDown' },
  { id: 'bottom-top', label: 'Bottom to top', icon: 'directionUp' },
  { id: 'left-right', label: 'Left to right', icon: 'directionRight' },
  { id: 'right-left', label: 'Right to left', icon: 'directionLeft' },
];
const SPACINGS: readonly { id: Spacing; label: string }[] = [
  { id: 'compact', label: 'Compact' },
  { id: 'normal', label: 'Normal' },
  { id: 'spacious', label: 'Spacious' },
];

/**
 * The toolbox's layout menu (#113): which way the flow runs (four directions) and how much room
 * the layout leaves (three spacings). Both are part of the diagram, saved in its file and undone
 * like any edit. The button shows the arrow of the current direction.
 */
@Component({
  selector: 'app-layout-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon],
  templateUrl: './layout-menu.html',
  styleUrl: './layout-menu.scss',
})
export class LayoutMenu {
  protected readonly store = inject(DiagramStore);
  private readonly injector = inject(Injector);
  /** Read-only while walking or looking at a path. */
  readonly disabled = input(false);

  protected readonly directions = DIRECTIONS;
  protected readonly spacings = SPACINGS;
  protected readonly isOpen = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  ];
  protected readonly current = computed(
    () => DIRECTIONS.find((d) => d.id === this.store.direction()) ?? DIRECTIONS[0],
  );
  protected readonly summary = computed(() => {
    const spacing = SPACINGS.find((s) => s.id === this.store.spacing())?.label ?? 'Normal';
    return `Layout: ${this.current().label.toLowerCase()}, ${spacing.toLowerCase()} spacing`;
  });

  protected toggle(): void {
    if (this.disabled()) return;
    this.isOpen.update((open) => !open);
    // The checked direction takes the focus, so the arrow keys start from it.
    if (this.isOpen()) {
      afterNextRender(
        () =>
          document
            .querySelector<HTMLElement>('.layout-menu [role=menuitemradio][aria-checked=true]')
            ?.focus(),
        { injector: this.injector },
      );
    }
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected setDirection(direction: Direction): void {
    this.store.setDirection(direction);
    this.close();
  }

  protected setSpacing(spacing: Spacing): void {
    this.store.setSpacing(spacing);
    this.close();
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') return this.close();
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const items = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitemradio]'),
    ];
    const next = items.indexOf(document.activeElement as HTMLElement) + step;
    items[(next + items.length) % items.length]?.focus();
  }
}
