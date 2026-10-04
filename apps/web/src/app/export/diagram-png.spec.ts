import { svgToPng } from './diagram-png';

describe('svgToPng', () => {
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context as unknown),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['png'], { type: 'image/png' }))),
  };
  const doc = { createElement: () => canvas } as unknown as Document;
  const size = { width: 100, height: 50 };

  beforeEach(() => {
    vi.clearAllMocks();
    canvas.getContext.mockReturnValue(context);
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        onerror?: () => void;
        set src(_: string) {
          queueMicrotask(() => (loadFails ? this.onerror?.() : this.onload?.()));
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    loadFails = false;
  });
  let loadFails = false;

  it('rasterises at 2× on white by default', async () => {
    const blob = await svgToPng('<svg/>', size, {}, doc);
    expect(blob.type).toBe('image/png');
    expect([canvas.width, canvas.height]).toEqual([200, 100]);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 200, 100);
  });

  it('honours the scale and a transparent background', async () => {
    await svgToPng('<svg/>', size, { scale: 3, background: null }, doc);
    expect([canvas.width, canvas.height]).toEqual([300, 150]);
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('scales a very large diagram down to what a canvas can be, instead of drawing nothing', async () => {
    // 150 states in a line: 37 000 px tall, over what a browser's canvas can hold (16 384).
    await svgToPng('<svg/>', { width: 1992, height: 37_029 }, {}, doc);
    expect(canvas.height).toBe(16_384);
    expect(canvas.width).toBe(Math.round(1992 * (16_384 / 37_029)));
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, canvas.width, 16_384);
  });

  it('keeps a requested scale as long as the canvas fits', async () => {
    await svgToPng('<svg/>', { width: 1000, height: 8000 }, { scale: 2 }, doc);
    expect([canvas.width, canvas.height]).toEqual([2000, 16_000]);
  });

  it('rejects an invalid scale', async () => {
    await expect(svgToPng('<svg/>', size, { scale: 0 }, doc)).rejects.toThrow(/scale/);
  });

  it('rejects when the image cannot be loaded', async () => {
    loadFails = true;
    await expect(svgToPng('<svg/>', size, {}, doc)).rejects.toThrow(/rendered/);
  });

  it('rejects when there is no 2d context or encoding fails', async () => {
    canvas.getContext.mockReturnValueOnce(null as never);
    await expect(svgToPng('<svg/>', size, {}, doc)).rejects.toThrow(/Canvas/);
    canvas.toBlob.mockImplementationOnce((cb) => cb(null));
    await expect(svgToPng('<svg/>', size, {}, doc)).rejects.toThrow(/encoding/);
  });
});
