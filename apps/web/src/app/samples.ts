import { Diagram, parseDiagram } from '@ariadne/core';
import booking from '../../../../samples/sagas/booking/BookingStateMachine.saga.yaml';
import order from '../../../../docs/examples/order.saga.yaml';
import travel from '../../../../docs/examples/travel-booking.saga.yaml';

/** Where a sample is offered: the short tour of what Ariadne draws, or the library of real-world sagas. */
export type SampleGroup = 'tour' | 'library';

/** A saga that ships with the app, to open as a starting point or to learn from. */
export interface Sample {
  /** The name of its folder in `samples/library`, or a short name of its own for the tour. */
  id: string;
  group: SampleGroup;
  title: string;
  description: string;
  /** The diagram as a `*.saga.yaml` file. */
  yaml: string;
}

/** The tour: three small sagas, one for each thing the app draws, first in the list. */
export const TOUR_SAMPLES: readonly Sample[] = [
  {
    id: 'order',
    group: 'tour',
    title: 'Order saga',
    description: 'Stock and payment, a payment retried and timed out. The simplest tour.',
    yaml: order,
  },
  {
    id: 'booking',
    group: 'tour',
    title: 'Booking saga',
    description: 'Branches on events from outside, read from C#.',
    yaml: booking,
  },
  {
    id: 'travel-booking',
    group: 'tour',
    title: 'Travel booking',
    description: 'Requests, a join, timeouts and compensation: flight, hotel and payment.',
    yaml: travel,
  },
];

/** The groups in the order the dialog shows them. */
export const SAMPLE_GROUPS: readonly { id: SampleGroup; title: string }[] = [
  { id: 'tour', title: 'Start with a tour' },
  { id: 'library', title: 'Real-world sagas' },
];

/** The library of real-world sagas, loaded when it is first asked for (it is a chunk of its own). */
export const loadLibrarySamples = (): Promise<readonly Sample[]> =>
  import('./library-samples').then((m) => m.LIBRARY_SAMPLES);

/** Every sample, the tour first. */
export const loadSamples = async (): Promise<readonly Sample[]> => [
  ...TOUR_SAMPLES,
  ...(await loadLibrarySamples()),
];

/** The sample with this id, or `undefined`. */
export const findSample = async (id: string): Promise<Sample | undefined> =>
  (await loadSamples()).find((s) => s.id === id);

/** The diagram of a sample; each time a new copy, so editing it never changes the sample. */
export const sampleDiagram = (sample: Sample): Diagram => parseDiagram(sample.yaml);
