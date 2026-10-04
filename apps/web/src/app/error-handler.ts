import { ErrorHandler, Injectable, inject, signal } from '@angular/core';

/** An unexpected error, as the banner shows it. */
export interface AppError {
  /** What went wrong, for people. */
  message: string;
}

/** The last unexpected error, until the user dismisses it. */
@Injectable({ providedIn: 'root' })
export class AppErrors {
  readonly current = signal<AppError | null>(null);

  report(error: unknown): void {
    this.current.set({ message: messageOf(error) });
  }

  dismiss(): void {
    this.current.set(null);
  }
}

/**
 * Shows an unexpected error in a banner instead of leaving the user with a screen that silently
 * stopped working. It never touches the document: the diagram is exactly as it was, and the banner
 * offers a way to keep it. Also receives what the browser reports (`error` and `unhandledrejection`
 * events, through `provideBrowserGlobalErrorListeners`).
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly errors = inject(AppErrors);

  handleError(error: unknown): void {
    console.error(error);
    if (isBenign(error)) return;
    this.errors.report(error);
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error instanceof ErrorEvent) return error.message;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** Browsers report this when a resize observer needs another frame; nothing is wrong. */
function isBenign(error: unknown): boolean {
  return /^ResizeObserver loop/.test(messageOf(error));
}
