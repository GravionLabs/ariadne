import { Component, inject, signal } from '@angular/core';
import { Icon } from './editor/icon';
import { DEMO_MODE } from './demo-mode';

const KEY = 'ariadne.demo-notice.dismissed';

/** Reads the remembered dismissal; storage can be missing or blocked, and the notice then shows. */
function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * In the demo build: says that diagrams stay in this browser, until it is dismissed (and remembered
 * if the browser lets the page keep it).
 */
@Component({
  selector: 'app-demo-notice',
  imports: [Icon],
  templateUrl: './demo-notice.html',
  styleUrl: './demo-notice.scss',
})
export class DemoNotice {
  protected readonly demo = inject(DEMO_MODE);
  protected readonly visible = signal(this.demo && !dismissedBefore());

  protected dismiss(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Not remembered: it shows again next time.
    }
  }
}
