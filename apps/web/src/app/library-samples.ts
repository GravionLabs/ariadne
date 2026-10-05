import order_fulfilment_yaml from '../../../../samples/library/order-fulfilment/order-fulfilment.saga.yaml';
import order_fulfilment_readme from '../../../../samples/library/order-fulfilment/README.md';
import payment_retries_yaml from '../../../../samples/library/payment-retries/payment-retries.saga.yaml';
import payment_retries_readme from '../../../../samples/library/payment-retries/README.md';
import customer_onboarding_yaml from '../../../../samples/library/customer-onboarding/customer-onboarding.saga.yaml';
import customer_onboarding_readme from '../../../../samples/library/customer-onboarding/README.md';
import trip_booking_yaml from '../../../../samples/library/trip-booking/trip-booking.saga.yaml';
import trip_booking_readme from '../../../../samples/library/trip-booking/README.md';
import loan_application_yaml from '../../../../samples/library/loan-application/loan-application.saga.yaml';
import loan_application_readme from '../../../../samples/library/loan-application/README.md';
import { describeSample } from './sample-readme';
import type { Sample } from './samples';

/**
 * The sample library (samples/library). This file is loaded on its own, when the New dialog opens:
 * the samples and their READMEs are about 40 kB that most visits never need, and the initial bundle
 * has a budget. A sample's title and description are the heading and first sentence of its README,
 * so the folder is the one place that says what the sample is.
 *
 * A new sample is one pair of imports above and one line below; `samples.spec.ts` fails for a folder
 * that is not here.
 */
const sample = (id: string, readme: string, yaml: string): Sample => ({
  id,
  group: 'library',
  ...describeSample(readme),
  yaml,
});

export const LIBRARY_SAMPLES: readonly Sample[] = [
  sample('order-fulfilment', order_fulfilment_readme, order_fulfilment_yaml),
  sample('payment-retries', payment_retries_readme, payment_retries_yaml),
  sample('customer-onboarding', customer_onboarding_readme, customer_onboarding_yaml),
  sample('trip-booking', trip_booking_readme, trip_booking_yaml),
  sample('loan-application', loan_application_readme, loan_application_yaml),
];
