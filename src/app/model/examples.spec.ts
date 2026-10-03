import orderSaga from '../../../docs/examples/order.saga.yaml';
import { publishedEvents } from './diagram';
import { parseDiagramWithNotes, serializeDiagram } from './diagram-yaml';

describe('docs/examples/order.saga.yaml', () => {
  const { diagram, notes } = parseDiagramWithNotes(orderSaga);

  it('is a valid, current-format diagram', () => {
    expect(notes).toEqual([]);
    expect(diagram.nodes.map((n) => n.type)).toEqual([
      'start',
      'state',
      'state',
      'state',
      'end',
      'end',
    ]);
    expect(diagram.edges).toHaveLength(6);
  });

  it('is written exactly as the editor would save it', () => {
    expect(serializeDiagram(diagram)).toBe(orderSaga);
  });

  it('shows the three kinds of messages: commands, a published event, external events', () => {
    const activities = diagram.nodes.flatMap((n) => n.activities ?? []);
    expect(activities.filter((a) => a.kind === 'command')).toHaveLength(3);
    expect([...publishedEvents(diagram)]).toEqual(['OrderAccepted']);
    expect(diagram.edges.every((e) => e.event && e.eventSource)).toBe(true);
  });
});
