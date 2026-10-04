/**
 * Counts the work a service has started and not finished, so a caller (the integration tests) can
 * wait for "nothing is pending" instead of sleeping.
 */
export class PendingWork {
  private count = 0;
  private waiters: (() => void)[] = [];

  /** Marks work as started; call the result once it is done (more than once is harmless). */
  begin(): () => void {
    this.count++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      if (--this.count === 0) this.waiters.splice(0).forEach((resolve) => resolve());
    };
  }

  /** Follows a promise; the result is the promise itself, so errors still reach the caller. */
  track<T>(work: Promise<T>): Promise<T> {
    const end = this.begin();
    work.then(end, end);
    return work;
  }

  /** Resolves once nothing is pending. */
  idle(): Promise<void> {
    return this.count === 0
      ? Promise.resolve()
      : new Promise((resolve) => this.waiters.push(resolve));
  }
}
