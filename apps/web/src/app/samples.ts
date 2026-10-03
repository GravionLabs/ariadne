import { Diagram, parseDiagram } from '@ariadne/core';
import booking from '../../../../samples/sagas/booking/BookingStateMachine.saga.yaml';
import order from '../../../../docs/examples/order.saga.yaml';
import travel from '../../../../docs/examples/travel-booking.saga.yaml';

/** A saga that ships with the app, to open as a starting point or to learn from. */
export interface Sample {
  id: string;
  title: string;
  description: string;
  /** The diagram as a `*.saga.yaml` file. */
  yaml: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'order',
    title: 'Order saga',
    description: 'Stock and payment, a payment retried and timed out. The simplest tour.',
    yaml: order,
  },
  {
    id: 'booking',
    title: 'Booking saga',
    description: 'Branches on events from outside, read from C#.',
    yaml: booking,
  },
  {
    id: 'travel-booking',
    title: 'Travel booking',
    description: 'Requests, a join, timeouts and compensation: flight, hotel and payment.',
    yaml: travel,
  },
];

/** The diagram of a sample; each time a new copy, so editing it never changes the sample. */
export const sampleDiagram = (sample: Sample): Diagram => parseDiagram(sample.yaml);
