import { Diagram, PathStep, serializeDiagram } from '@ariadne/core';
import { largeSaga } from '@ariadne/core/testing';
import { AriadneSagaElement, defineAriadneSaga } from './saga-element';

// A saga with choices, a join, a loop, a command, a published event and a problem (an orphan).
const saga: Diagram = { ...largeSaga(12), name: 'Order' };
const path: PathStep[] = [{ event: 'Event0Happened' }, { event: 'Event1Happened' }];

defineAriadneSaga();

const next = (element: Element, type: string) =>
  new Promise<void>((resolve) => element.addEventListener(type, () => resolve(), { once: true }));

/** Serious or critical axe findings; jsdom has no layout, so the colour contrast rule is off. */
async function axeFindings(root: HTMLElement): Promise<string[]> {
  const { default: axe } = await import('axe-core');
  const { violations } = await axe.run(root, { rules: { 'color-contrast': { enabled: false } } });
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

afterEach(() => document.body.replaceChildren());

const PANELS: [name: string, feature: string | null, label: string | null][] = [
  ['the diagram alone', null, null],
  ['the walkthrough', 'walkthrough', 'Walkthrough'],
  ['the message catalog', 'messages', 'Message catalog'],
  ['the problems', 'problems', 'Problems'],
];

describe.each(['light', 'dark'])('<ariadne-saga> accessibility, %s theme', (theme) => {
  for (const [name, feature, label] of PANELS) {
    it(`has no serious axe findings: ${name}, with a path set`, async () => {
      const element = document.createElement('ariadne-saga') as AriadneSagaElement;
      element.setAttribute('features', 'walkthrough messages problems');
      element.setAttribute('theme', theme);
      element.setAttribute('source', serializeDiagram(saga));
      const loaded = next(element, 'load');
      document.body.append(element);
      await loaded;
      const resolved = next(element, 'pathresolved');
      element.path = path;
      await resolved;

      if (feature) {
        element.shadowRoot!.querySelector<HTMLElement>(`[data-feature="${feature}"]`)!.click();
        expect(element.shadowRoot!.querySelector('.panel')?.getAttribute('aria-label')).toBe(label);
      } else {
        expect(element.shadowRoot!.querySelectorAll('.panel')).toHaveLength(0);
      }
      expect(element.shadowRoot!.querySelectorAll('[data-node-id]').length).toBeGreaterThan(10);
      // axe reaches into the open shadow root by itself.
      expect(await axeFindings(element)).toEqual([]);
    });
  }
});
