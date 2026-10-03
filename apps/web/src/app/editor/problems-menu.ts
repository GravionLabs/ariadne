import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, computed, inject, output, signal } from '@angular/core';
import { Finding, SEVERITIES, Severity } from '../model/validation';
import { EditorStore } from './editor-store';
import { Icon } from './icon';

const LABELS: Record<Severity, [string, string]> = {
  error: ['error', 'errors'],
  warning: ['warning', 'warnings'],
  info: ['hint', 'hints'],
};

/**
 * The toolbox's "Problems" button: how many findings there are of each severity; opening it lists
 * them, and picking one asks the editor to show the element it is about.
 */
@Component({
  selector: 'app-problems-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon],
  templateUrl: './problems-menu.html',
  styleUrl: './problems-menu.scss',
})
export class ProblemsMenu {
  private readonly editor = inject(EditorStore);

  /** A finding was picked. */
  readonly picked = output<Finding>();

  protected readonly isOpen = signal(false);
  protected readonly severities = SEVERITIES;
  protected readonly findings = this.editor.findings;
  protected readonly counts = this.editor.findingCounts;
  protected readonly total = computed(() => this.findings().length);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -10 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 10 },
  ];

  /** `2 errors, 1 hint`, or `No problems`: also the button's accessible name. */
  protected readonly summary = computed(() => {
    const parts = SEVERITIES.filter((s) => this.counts()[s] > 0).map((s) => {
      const n = this.counts()[s];
      return `${n} ${LABELS[s][n === 1 ? 0 : 1]}`;
    });
    return parts.length ? parts.join(', ') : 'No problems';
  });

  protected readonly worstSeverity = computed(() => SEVERITIES.find((s) => this.counts()[s] > 0));

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected pick(finding: Finding): void {
    if (!finding.elementId) return;
    this.picked.emit(finding);
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }
}
