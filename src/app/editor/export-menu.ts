import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Component, inject, signal } from '@angular/core';
import { DiagramExport } from '../export/diagram-export';
import { Icon } from './icon';

interface ExportEntry {
  label: string;
  hint: string;
  run: () => unknown;
}

/** The top bar's "Export" menu: images and Mermaid text, each saved or copied. */
@Component({
  selector: 'app-export-menu',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon],
  templateUrl: './export-menu.html',
  styleUrl: './export-menu.scss',
})
export class ExportMenu {
  private readonly exporter = inject(DiagramExport);

  protected readonly isOpen = signal(false);
  protected readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];

  protected readonly images: readonly ExportEntry[] = [
    { label: 'SVG', hint: 'Scalable image (.svg)', run: () => this.exporter.exportSvg() },
    { label: 'PNG', hint: 'Image at 2× (.png)', run: () => this.exporter.exportPng() },
  ];
  protected readonly mermaid: readonly ExportEntry[] = [
    {
      label: 'Copy Mermaid',
      hint: 'To the clipboard',
      run: () => this.exporter.copyMermaid(),
    },
    {
      label: 'Mermaid',
      hint: 'State diagram text (.mmd)',
      run: () => this.exporter.exportMermaid('mmd'),
    },
    {
      label: 'Mermaid in Markdown',
      hint: 'Fenced block (.md)',
      run: () => this.exporter.exportMermaid('md'),
    },
  ];

  protected readonly documentation: readonly ExportEntry[] = [
    {
      label: 'Markdown page',
      hint: 'States, transitions, messages (.docs.md)',
      run: () => this.exporter.exportMarkdown(),
    },
  ];

  protected toggle(): void {
    this.isOpen.update((open) => !open);
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  protected pick(entry: ExportEntry): void {
    this.close();
    entry.run();
  }

  protected onOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') return this.close();
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const items = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=menuitem]'),
    ];
    const next = items.indexOf(document.activeElement as HTMLElement) + step;
    items[(next + items.length) % items.length]?.focus();
  }
}
