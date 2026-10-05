import { Diagram, parseDiagram, pathTimeline, resolvePath } from '@ariadne/core';
import { describe, expect, it } from 'vitest';
import orderYaml from '../../../docs/examples/order.saga.yaml?raw';
import { describeTimeline } from './describe';
import { renderTimelineSvg } from './svg';

const order = parseDiagram(orderYaml);
const timelineOf = (diagram: Diagram, steps: Parameters<typeof resolvePath>[1]) =>
  pathTimeline(diagram, resolvePath(diagram, steps));
const events = (...names: string[]) => names.map((event) => ({ event }));
const happy = timelineOf(
  order,
  events('OrderReceived', 'StockReserved', 'PaymentCharged', 'OrderShipped'),
);

describe('renderTimelineSvg', () => {
  it('draws every state the instance went through and every step, left to right', () => {
    const { svg, width, height } = renderTimelineSvg(order, happy, { addressable: true });
    const states = happy.filter((e) => e.kind === 'state');
    expect(svg.match(/data-node-id="/g)).toHaveLength(states.length);
    expect(svg.match(/data-kind="step"/g)).toHaveLength(happy.length - states.length);
    expect(svg).toContain('>OrderReceived</text>');
    expect(height).toBe(100);
    // One row: x grows from one entry to the next.
    const xs = [
      ...svg.matchAll(
        /data-timeline-index="\d+"[^>]*><g><(?:rect|path) (?:x="([\d.]+)"|d="M([\d.]+))/g,
      ),
    ].map((m) => Number(m[1] ?? m[2]));
    expect(xs.length).toBe(happy.length);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(width).toBeGreaterThan(xs.at(-1)!);
  });

  it('marks the state the instance is in now, and a finished one', () => {
    const now = renderTimelineSvg(order, timelineOf(order, events('OrderReceived')), {
      addressable: true,
    }).svg;
    expect(now).toContain('data-status="current"');
    expect(now).toContain('>now</text>');
    const done = renderTimelineSvg(order, happy, { addressable: true }).svg;
    expect(done).toContain('data-status="finished"');
    expect(done).toContain('>finished</text>');
  });

  it('shows a loop as often as it was taken, with the count, and the guard of a step', () => {
    const loop = timelineOf(order, [
      ...events('OrderReceived', 'StockReserved'),
      { event: 'PaymentFailed', to: 'Charging payment' },
      { event: 'PaymentFailed', to: 'Charging payment' },
    ]);
    const { svg } = renderTimelineSvg(order, loop, { addressable: true });
    expect(svg.match(/data-node-id="state-2"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(svg).toMatch(/>2nd time</);
    expect(svg).toMatch(/>now · 3rd time</);
  });

  it('ends with the problem where the path stopped, with the whole message as its title', () => {
    const stuck = timelineOf(order, events('OrderReceived', 'Nonsense'));
    const { svg } = renderTimelineSvg(order, stuck, { addressable: true });
    expect(svg).toContain('data-kind="problem"');
    expect(svg).toMatch(/<title>Step 2: .*Nonsense.*<\/title>/);
  });

  it('has a text alternative that lists the steps', () => {
    const { svg } = renderTimelineSvg(order, happy, { idPrefix: 'p-' });
    expect(svg).toContain('role="img" aria-labelledby="p-timeline-title p-timeline-desc"');
    expect(svg).toContain('<title id="p-timeline-title">Path of the instance</title>');
    expect(svg).toContain(
      `<desc id="p-timeline-desc">${describeTimeline(happy).replace(/→/g, '→')}</desc>`,
    );
    expect(svg).toContain('id="p-arrow-timeline"');
  });

  it('escapes names and events, and can be themed with CSS variables', () => {
    const odd: Diagram = {
      direction: 'top-bottom',
      nodes: [
        { id: 's', type: 'start', name: 'Initial' },
        { id: 'a', type: 'state', name: 'A <b> & "c"' },
      ],
      edges: [{ id: 'e', source: 's', target: 'a', kind: 'forward', event: 'X<Y>' }],
    };
    const { svg } = renderTimelineSvg(odd, timelineOf(odd, events('X<Y>')), { cssVariables: true });
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('A &lt;b&gt; &amp; &quot;c&quot;');
    expect(svg).toContain('X&lt;Y&gt;');
    expect(svg).toContain('var(--ariadne-');
  });

  it('is deterministic, and says so when there is nothing to draw', () => {
    expect(renderTimelineSvg(order, happy).svg).toBe(renderTimelineSvg(order, happy).svg);
    expect(renderTimelineSvg(order, []).svg).toContain('>No path.</text>');
  });
});

describe('describeTimeline', () => {
  it('says each step with the states around it, then where the instance is', () => {
    const now = timelineOf(order, events('OrderReceived', 'StockReserved'));
    expect(describeTimeline(now)).toBe(
      '1. OrderReceived: Initial → Reserving stock. 2. StockReserved: Reserving stock → Charging payment. Now in Charging payment.',
    );
    expect(describeTimeline(happy)).toMatch(/Finished in Completed\.$/);
  });

  it('ends with the problem, after where the instance is', () => {
    const text = describeTimeline(timelineOf(order, events('OrderReceived', 'Nonsense')));
    expect(text).toMatch(
      /^1\. OrderReceived: Initial → Reserving stock\. Now in Reserving stock\. Step 2: /,
    );
  });

  it('has something to say for an empty path', () => {
    expect(describeTimeline([])).toBe('No path.');
  });
});
