import { describe, expect, it } from 'vitest';
import { PendingWork } from './pending-work';

describe('PendingWork', () => {
  it('is idle when nothing started', async () => {
    await expect(new PendingWork().idle()).resolves.toBeUndefined();
  });

  it('waits for every piece of work, and for a promise to settle', async () => {
    const work = new PendingWork();
    const endFirst = work.begin();
    let release!: () => void;
    void work.track(new Promise<void>((resolve) => (release = resolve)));
    let idle = false;
    void work.idle().then(() => (idle = true));

    endFirst();
    endFirst(); // a second call must not end the other work
    await Promise.resolve();
    expect(idle).toBe(false);

    release();
    await work.idle();
    expect(idle).toBe(true);
  });

  it('counts a failed promise as done and still rejects to the caller', async () => {
    const work = new PendingWork();
    await expect(work.track(Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(work.idle()).resolves.toBeUndefined();
  });
});
