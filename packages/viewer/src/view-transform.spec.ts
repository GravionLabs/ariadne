import { fitView, MAX_SCALE, MIN_SCALE, panBy, revealBox, zoomAt } from './view-transform';

describe('fitView', () => {
  it('centres a small diagram at its real size', () => {
    expect(fitView({ width: 200, height: 100 }, { width: 400, height: 300 })).toEqual({
      scale: 1,
      x: 100,
      y: 100,
    });
  });

  it('shrinks a large diagram to the viewport, leaving the padding', () => {
    const view = fitView({ width: 1000, height: 500 }, { width: 532, height: 400 }, 16);
    expect(view.scale).toBeCloseTo(0.5);
    expect(view.x).toBeCloseTo(16);
    expect(view.y).toBeCloseTo(75);
  });

  it('never goes below the minimum zoom', () => {
    expect(fitView({ width: 1e6, height: 1e6 }, { width: 100, height: 100 }).scale).toBe(MIN_SCALE);
  });

  it('falls back to the identity before anything has a size', () => {
    expect(fitView({ width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the anchor where it is', () => {
    const view = { scale: 1, x: 20, y: 10 };
    const anchor = { x: 120, y: 90 };
    const zoomed = zoomAt(view, 2, anchor);
    // the diagram point under the anchor before: (100, 80); after, at the same pixels
    expect((anchor.x - zoomed.x) / zoomed.scale).toBeCloseTo(100);
    expect((anchor.y - zoomed.y) / zoomed.scale).toBeCloseTo(80);
  });

  it('is limited to the zoom range without drifting', () => {
    const view = { scale: MAX_SCALE, x: 5, y: 5 };
    expect(zoomAt(view, 2, { x: 50, y: 50 })).toEqual(view);
    expect(zoomAt({ scale: MIN_SCALE, x: 0, y: 0 }, 0.5, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });
});

describe('panBy and revealBox', () => {
  it('moves the view', () => {
    expect(panBy({ scale: 2, x: 1, y: 2 }, 10, -5)).toEqual({ scale: 2, x: 11, y: -3 });
  });

  it('leaves a visible box alone and shifts one that is cut off', () => {
    const view = { scale: 1, x: 0, y: 0 };
    const viewport = { width: 400, height: 300 };
    expect(revealBox(view, { x: 100, y: 100, width: 50, height: 50 }, viewport)).toEqual(view);
    expect(revealBox(view, { x: 380, y: 100, width: 50, height: 50 }, viewport).x).toBe(-54);
    expect(revealBox(view, { x: -30, y: 290, width: 50, height: 50 }, viewport)).toEqual({
      scale: 1,
      x: 54,
      y: -64,
    });
  });
});
