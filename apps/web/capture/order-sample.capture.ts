import { expect, openApp, openSample, shots, test } from './helpers';

// The proof that the setup works: the order sample, open, in both themes.
test('order-sample', async ({ page }) => {
  await openApp(page);
  await openSample(page, 'order');
  await expect(page.locator('app-node-card').first()).toBeVisible();
  await shots(page, 'order-sample');
});
