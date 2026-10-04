import {
  buildCatalog,
  Diagram,
  doingsOf,
  eventLabel,
  Finding,
  follow,
  MessageEntry,
  optionsAt,
  SEVERITIES,
} from '@ariadne/core';
import { h } from './dom';

/** The walkthrough's result: the transitions taken (edge ids) and the states along them (node ids). */
export interface SagaWalk {
  steps: string[];
  path: string[];
}

export interface Panel {
  element: HTMLElement;
  /** Takes the panel back to its first state (a new diagram). */
  destroy?(): void;
}

const section = (title: string, label: string, ...children: (Node | string)[]) =>
  h(
    'section',
    { class: 'panel', part: 'panel', 'aria-label': label },
    h('h3', {}, title),
    ...children,
  );

const button = (text: string, attributes: Record<string, string> = {}) =>
  h('button', { type: 'button', ...attributes }, text);

/**
 * Walk through the saga step by step: from the initial state, pick one of the transitions the state
 * offers (the same rules as the editor's walkthrough, `optionsAt`), go back, start over.
 */
export function walkthroughPanel(diagram: Diagram, onChange: (walk: SagaWalk) => void): Panel {
  let steps: string[] = [];
  const body = h('div', { class: 'walk' });
  const element = section('Walkthrough', 'Walkthrough', body);

  const walk = (): SagaWalk => ({
    steps: [...steps],
    path: (follow(diagram, steps) ?? []).map((n) => n.id),
  });
  const go = (next: string[]) => {
    steps = next;
    render();
    onChange(walk());
  };

  function render(): void {
    const path = follow(diagram, steps);
    body.replaceChildren();
    if (!path) {
      body.append(h('p', { class: 'hint' }, 'This diagram has no initial state to start from.'));
      return;
    }
    const here = path[path.length - 1];
    const options = optionsAt(diagram, here.id);
    const doings = doingsOf(here);
    const current = h(
      'div',
      { class: 'current', role: 'status', 'aria-live': 'polite' },
      h('strong', {}, here.name),
      ...doings.map((d) => h('div', { class: 'doing' }, d)),
    );
    const choices = h('ul', { class: 'options', 'aria-label': 'Next transitions' });
    for (const edge of options) {
      const target = diagram.nodes.find((n) => n.id === edge.target)!;
      const choose = button(`${eventLabel(edge) || '(no event)'} → ${target.name}`, {
        'data-option': edge.id,
      });
      choose.addEventListener('click', () => go([...steps, edge.id]));
      choices.append(h('li', {}, choose));
    }
    if (!options.length) {
      body.append(
        current,
        h(
          'p',
          { class: 'hint' },
          here.type === 'end' ? 'The saga is finished here.' : 'No transition leaves this state.',
        ),
      );
    } else {
      body.append(current, choices);
    }
    const back = button('Back', { 'data-action': 'back' });
    back.disabled = steps.length === 0;
    back.addEventListener('click', () => go(steps.slice(0, -1)));
    const restart = button('Restart', { 'data-action': 'restart' });
    restart.disabled = steps.length === 0;
    restart.addEventListener('click', () => go([]));
    body.append(h('div', { class: 'actions' }, back, restart));
    if (steps.length) {
      body.append(
        h(
          'ol',
          { class: 'steps', 'aria-label': 'Steps so far' },
          ...steps.map((id, i) => {
            const edge = diagram.edges.find((e) => e.id === id)!;
            return h('li', {}, `${eventLabel(edge) || '(no event)'} → ${path[i + 1].name}`);
          }),
        ),
      );
    }
  }

  render();
  return { element };
}

/** The commands and events of the saga; picking one shows where it is sent, published and used. */
export function messagesPanel(
  diagram: Diagram,
  onPick: (entry: MessageEntry | null) => void,
): Panel {
  const catalog = buildCatalog(diagram);
  const list = h('ul', { class: 'messages' });
  const element = section('Messages', 'Message catalog', list);
  if (!catalog.length)
    list.replaceWith(h('p', { class: 'hint' }, 'The saga has no commands or events yet.'));
  let picked: MessageEntry | undefined;
  const buttons = new Map<MessageEntry, HTMLButtonElement>();
  for (const entry of catalog) {
    const detail = [
      entry.kind === 'command'
        ? 'command'
        : `event${entry.origin && entry.origin !== 'internal' ? `, ${entry.origin}` : ''}`,
      entry.producers.length ? `sent by ${entry.producers.map((p) => p.name).join(', ')}` : '',
      entry.reactions.length
        ? `used by ${entry.reactions.length} transition${entry.reactions.length === 1 ? '' : 's'}`
        : '',
      entry.sources.length ? `from ${entry.sources.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const pick = h(
      'button',
      { type: 'button', 'aria-pressed': 'false', 'data-message': `${entry.kind}:${entry.name}` },
      h('span', { class: 'message-name' }, entry.name),
      h('span', { class: 'message-detail' }, detail),
    );
    pick.addEventListener('click', () => {
      picked = picked === entry ? undefined : entry;
      for (const [e, b] of buttons) b.setAttribute('aria-pressed', String(e === picked));
      onPick(picked ?? null);
    });
    buttons.set(entry, pick);
    list.append(h('li', {}, pick));
  }
  return { element };
}

const SEVERITY_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' } as const;

/** What `validate` finds, most severe first; picking one selects the state or transition. */
export function problemsPanel(
  diagram: Diagram,
  findings: readonly Finding[],
  onPick: (finding: Finding) => void,
): Panel {
  const list = h('ul', { class: 'problems' });
  const element = section('Problems', 'Problems', list);
  if (!findings.length) list.replaceWith(h('p', { class: 'hint' }, 'No problems found.'));
  const elementName = (id?: string) =>
    diagram.nodes.find((n) => n.id === id)?.name ??
    (id
      ? (() => {
          const e = diagram.edges.find((x) => x.id === id);
          return e ? eventLabel(e) || 'transition' : undefined;
        })()
      : undefined);
  const bySeverity = [...findings].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
  );
  for (const finding of bySeverity) {
    const where = elementName(finding.elementId);
    const pick = h(
      'button',
      { type: 'button', 'data-severity': finding.severity },
      h('span', { class: 'severity' }, SEVERITY_LABEL[finding.severity]),
      h('span', { class: 'problem-message' }, finding.message),
      ...(where ? [h('span', { class: 'message-detail' }, where)] : []),
    );
    pick.disabled = !finding.elementId;
    pick.addEventListener('click', () => onPick(finding));
    list.append(h('li', {}, pick));
  }
  return { element };
}
