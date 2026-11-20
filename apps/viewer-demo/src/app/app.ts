import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import type { PathStep, ResolvedPath } from '@ariadne/core';
import type { SagaSelectDetail } from '@ariadne/viewer';
import { AriadneSaga } from '@ariadne/viewer/angular';

/** The instance's history, as an app would have it from its own API. */
const HISTORY: PathStep[] = [
  { event: 'OrderSubmitted', at: '10:00' },
  { event: 'StockReserved', at: '10:01', note: 'in stock' },
];

@Component({
  selector: 'app-root',
  imports: [AriadneSaga],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly path = signal<PathStep[]>(HISTORY.slice(0, 1));
  protected readonly selected = signal('nothing');
  protected readonly resolved = signal<ResolvedPath | null>(null);

  protected advance(): void {
    this.path.update((p) => HISTORY.slice(0, Math.min(HISTORY.length, p.length + 1)));
  }

  protected describe({ selection }: SagaSelectDetail): string {
    return selection ? `${selection.kind} ${selection.id}` : 'nothing';
  }
}
