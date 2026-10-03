import { Diagram } from '../model/diagram';
import { fit, renderDiagramSvg } from './diagram-svg';

/** The order saga: external trigger, activities, a decision, a compensation and a final state. */
const orderSaga: Diagram = {
  direction: 'top-bottom',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Reserving stock',
      activities: [{ kind: 'command', name: 'ReserveStock' }],
      compensation: { name: 'ReleaseStock' },
    },
    {
      id: 'state-2',
      type: 'state',
      name: 'Charging payment',
      color: 'orange',
      activities: [
        { kind: 'command', name: 'ChargePayment' },
        { kind: 'event', name: 'PaymentRequested' },
      ],
    },
    { id: 'end-1', type: 'end', name: 'Completed' },
    { id: 'end-2', type: 'end', name: 'Cancelled' },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
      eventSource: 'Shop API',
    },
    { id: 'edge-2', source: 'state-1', target: 'state-2', kind: 'forward', event: 'StockReserved' },
    { id: 'edge-3', source: 'state-2', target: 'end-1', kind: 'forward', event: 'PaymentCharged' },
    { id: 'edge-4', source: 'state-2', target: 'end-2', kind: 'forward', event: 'PaymentFailed' },
    { id: 'edge-5', source: 'state-2', target: 'state-1', kind: 'compensation', event: 'Undo' },
  ],
};

describe('renderDiagramSvg', () => {
  it('renders the order saga', () => {
    expect(renderDiagramSvg(orderSaga).svg).toMatchSnapshot();
  });

  it('is deterministic', () => {
    expect(renderDiagramSvg(orderSaga).svg).toBe(renderDiagramSvg(orderSaga).svg);
  });

  it('draws states, arrowheads, labels and a dashed compensation, without editor chrome', () => {
    const { svg } = renderDiagramSvg(orderSaga);
    for (const name of ['Reserving stock', 'Charging payment', 'Completed', 'Cancelled']) {
      expect(svg).toContain(name);
    }
    expect(svg).toContain('⚡');
    expect(svg).toContain('from Shop API');
    expect(svg).toContain('Send');
    expect(svg).toContain('Publish');
    expect(svg.match(/marker-end="url\(#arrow-forward\)"/g)).toHaveLength(4);
    expect(svg.match(/stroke-dasharray="6 4"/g)).toHaveLength(1);
    expect(svg).not.toContain('slot');
  });

  it('writes plain colours: no CSS variables and no color-mix', () => {
    const { svg } = renderDiagramSvg(orderSaga);
    expect(svg).not.toMatch(/var\(|color-mix/);
    expect(svg).toContain('#f97316'); // palette colour of "Charging payment"
  });

  it('shows a state that several transitions leave as a decision', () => {
    expect(renderDiagramSvg(orderSaga).svg).toContain('DECISION');
  });

  it('sizes the viewBox to the content', () => {
    const { svg, width, height } = renderDiagramSvg(orderSaga);
    expect(svg).toContain(`width="${width}" height="${height}"`);
    expect(width).toBeGreaterThan(260);
    expect(height).toBeGreaterThan(300);
  });

  it('lays out left-right too', () => {
    const lr = renderDiagramSvg({ ...orderSaga, direction: 'left-right' });
    const tb = renderDiagramSvg(orderSaga);
    expect(lr.width).toBeGreaterThan(tb.width);
  });

  it('renders an empty diagram without throwing', () => {
    expect(() => renderDiagramSvg({ direction: 'top-bottom', nodes: [], edges: [] })).not.toThrow();
  });

  it('escapes markup in names and truncates long ones', () => {
    const { svg } = renderDiagramSvg({
      direction: 'top-bottom',
      nodes: [{ id: 'a', type: 'state', name: `A <b> & "c" ${'x'.repeat(80)}` }],
      edges: [],
    });
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('…');
    expect(svg).not.toContain('x'.repeat(80));
  });

  it('ignores transitions to missing states', () => {
    const svg = renderDiagramSvg({
      ...orderSaga,
      edges: [{ id: 'bad', source: 'nope', target: 'state-1', kind: 'forward' }],
    }).svg;
    expect(svg).not.toContain('marker-end');
  });
});

describe('fit', () => {
  it('keeps text that fits and truncates the rest with an ellipsis', () => {
    expect(fit('short', 200, 12)).toBe('short');
    const cut = fit('a very long state name indeed', 60, 12);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(15);
  });
});
