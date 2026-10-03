import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CODE_EDITOR_FACTORY, CodeEditor } from './code-editor';
import { Icon } from './icon';
import { SourceSync } from './source-sync';

/**
 * The diagram as YAML next to the canvas. The text editor is loaded on first use; the text and
 * the diagram are kept in step by {@link SourceSync}, which lives only while the panel is open.
 */
@Component({
  selector: 'app-source-panel',
  imports: [Icon],
  providers: [SourceSync],
  host: { role: 'region', 'aria-label': 'Diagram source' },
  templateUrl: './source-panel.html',
  styleUrl: './source-panel.scss',
})
export class SourcePanel {
  protected readonly sync = inject(SourceSync);
  private readonly createEditor = inject(CODE_EDITOR_FACTORY);
  private readonly mount = viewChild.required<ElementRef<HTMLElement>>('editor');

  readonly closed = output<void>();

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  private editor: CodeEditor | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.load());
    // Diagram → text: push every new text into the editor (it ignores identical text).
    effect(() => {
      const text = this.sync.text();
      this.editor?.setText(text);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.editor?.destroy();
    });
  }

  private async load(): Promise<void> {
    try {
      const editor = await this.createEditor(this.mount().nativeElement, {
        text: this.sync.text(),
        onChange: (text) => this.sync.edit(text),
        onBlur: () => this.sync.flush(),
      });
      if (this.destroyed) {
        editor.destroy();
        return;
      }
      this.editor = editor;
      editor.setText(this.sync.text());
      this.loading.set(false);
    } catch {
      this.failed.set(true);
      this.loading.set(false);
    }
  }
}
