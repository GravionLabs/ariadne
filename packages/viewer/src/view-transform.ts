/** Pan and zoom of the diagram inside the viewer: pure maths, so it is easy to test. */
export interface View {
  scale: number;
  /** Where the diagram's top-left corner is, in the viewer's pixels. */
  x: number;
  y: number;
}

export interface Extent {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;
/** One step of the zoom buttons and keys. */
export const ZOOM_STEP = 1.25;
/** One step of the arrow keys, in pixels. */
export const PAN_STEP = 60;

const clamp = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** The whole diagram, centred, and never larger than its real size. */
export function fitView(content: Extent, viewport: Extent, padding = 16): View {
  if (!content.width || !content.height || !viewport.width || !viewport.height) {
    return { scale: 1, x: 0, y: 0 };
  }
  const scale = clamp(
    Math.min(
      1,
      (viewport.width - 2 * padding) / content.width,
      (viewport.height - 2 * padding) / content.height,
    ),
  );
  return {
    scale,
    x: (viewport.width - content.width * scale) / 2,
    y: (viewport.height - content.height * scale) / 2,
  };
}

/** Zooms by `factor` and keeps the diagram point under `anchor` (viewer pixels) where it is. */
export function zoomAt(view: View, factor: number, anchor: { x: number; y: number }): View {
  const scale = clamp(view.scale * factor);
  const ratio = scale / view.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - view.x) * ratio,
    y: anchor.y - (anchor.y - view.y) * ratio,
  };
}

export const panBy = (view: View, dx: number, dy: number): View => ({
  ...view,
  x: view.x + dx,
  y: view.y + dy,
});

/** Moves the view just enough to bring `box` (viewer pixels) inside the viewport. */
export function revealBox(
  view: View,
  box: { x: number; y: number; width: number; height: number },
  viewport: Extent,
  margin = 24,
): View {
  const shift = (start: number, size: number, available: number) => {
    if (start < margin) return margin - start;
    if (start + size > available - margin) return available - margin - (start + size);
    return 0;
  };
  return panBy(
    view,
    shift(box.x, box.width, viewport.width),
    shift(box.y, box.height, viewport.height),
  );
}
