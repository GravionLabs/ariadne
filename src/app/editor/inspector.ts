import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  output,
} from '@angular/core';
import {
  Activity,
  DiagramNode,
  EdgeKind,
  MessageKind,
  NODE_COLORS,
  NodeColor,
  NodeType,
  hasActivities,
  REQUEST_OUTCOMES,
  Request,
  Timer,
  hasCombines,
  hasIgnores,
  hasRequests,
  hasTimers,
  requestEvent,
} from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { namingHint } from '../model/messages';
import { DiagramLayout } from './diagram-layout';
import { EditorStore } from './editor-store';
import { Icon } from './icon';
import { DECISION, NODE_TYPES } from './node-types';

const NEW_MESSAGE: Record<MessageKind, string> = {
  command: 'DoSomething',
  event: 'SomethingHappened',
};

/**
 * Edits the state or transition selected in the editor. Fields commit on `change` (blur or Enter), so every edit is
 * one undo step; unchanged values are not committed.
 */
@Component({
  selector: 'app-inspector',
  imports: [Icon],
  host: { role: 'complementary', '[attr.aria-label]': 'title()' },
  templateUrl: './inspector.html',
  styleUrl: './inspector.scss',
})
export class Inspector {
  private readonly store = inject(DiagramStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly editor = inject(EditorStore);
  private readonly layout = inject(DiagramLayout);

  /** The selected state or transition, from the editor's selection. */
  protected readonly node = this.editor.selectedNode;
  protected readonly edge = this.editor.selectedEdge;
  /** The selected state has several transitions. */
  protected readonly decision = computed(() => {
    const node = this.node();
    return !!node && this.layout.decisions().has(node.id);
  });
  readonly closed = output<void>();
  readonly deleted = output<void>();
  /** "Add transition": a new state of this type should follow the selected one. */
  readonly transitionAdded = output<NodeType>();

  protected readonly namingHint = namingHint;
  protected readonly hasActivities = hasActivities;
  protected readonly hasIgnores = hasIgnores;
  protected readonly hasTimers = hasTimers;
  protected readonly hasRequests = hasRequests;
  protected readonly hasCombines = hasCombines;
  protected readonly colors = NODE_COLORS;

  protected readonly customColor = computed(() => {
    const c = this.node()?.color;
    return c?.startsWith('#') ? c : '#3b82f6';
  });

  protected pickColor(event: Event): void {
    this.setColor((event.target as HTMLInputElement).value as NodeColor);
  }

  protected setColor(color: NodeColor | undefined): void {
    const node = this.node();
    if (node && color !== node.color) this.store.updateNode(node.id, { color });
  }

  protected readonly nodeInfo = computed(() => {
    const node = this.node();
    if (!node) return null;
    return this.decision() ? DECISION : NODE_TYPES[node.type];
  });

  protected readonly title = computed(() => {
    const info = this.nodeInfo();
    return info ? `${info.label} settings` : 'Transition settings';
  });

  /** Source and target state names of the selected transition. */
  protected readonly ends = computed(() => {
    const edge = this.edge();
    if (!edge) return null;
    const name = (id: string) => this.store.nodes().find((n) => n.id === id)?.name ?? id;
    return { from: name(edge.source), to: name(edge.target) };
  });

  protected setName(event: Event): void {
    const node = this.node();
    const field = event.target as HTMLInputElement;
    const name = field.value.trim();
    if (!node) return;
    if (name === '') {
      // A node always has a name: put the old one back.
      field.value = node.name;
      return;
    }
    if (name !== node.name) this.store.updateNode(node.id, { name });
  }

  protected setText(field: 'description' | 'retry' | 'timeout', event: Event): void {
    const node = this.node();
    const value = optional(event);
    if (node && value !== node[field]) this.store.updateNode(node.id, { [field]: value });
  }

  protected addActivity(kind: MessageKind): void {
    const node = this.node();
    if (!node) return;
    this.setActivities(node, [...(node.activities ?? []), { kind, name: NEW_MESSAGE[kind] }]);
    // Focus the new name so it can be typed over right away.
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.message input');
        const last = inputs[inputs.length - 1];
        last?.focus();
        last?.select();
      },
      { injector: this.injector },
    );
  }

  protected setActivityKind(index: number, kind: MessageKind): void {
    const node = this.node();
    const activities = node?.activities ?? [];
    if (!node || activities[index]?.kind === kind) return;
    this.setActivities(
      node,
      activities.map((a, i) => (i === index ? { ...a, kind } : a)),
    );
  }

  protected setActivityName(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const activities = node?.activities ?? [];
    if (!node || name === activities[index]?.name) return;
    // An empty name removes the activity.
    this.setActivities(
      node,
      name
        ? activities.map((a, i) => (i === index ? { ...a, name } : a))
        : activities.filter((_, i) => i !== index),
    );
  }

  protected removeActivity(index: number): void {
    const node = this.node();
    if (node)
      this.setActivities(
        node,
        (node.activities ?? []).filter((_, i) => i !== index),
      );
  }

  protected addRequest(): void {
    const node = this.node();
    if (!node) return;
    this.setRequests(node, [...(node.requests ?? []), { name: 'DoSomething', timeout: '30s' }]);
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.request .name');
        const last = inputs[inputs.length - 1];
        last?.focus();
        last?.select();
      },
      { injector: this.injector },
    );
  }

  /** An empty name removes the request. */
  protected setRequestName(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const requests = node?.requests ?? [];
    if (!node || name === requests[index]?.name) return;
    this.setRequests(
      node,
      name
        ? requests.map((r, i) => (i === index ? { ...r, name } : r))
        : requests.filter((_, i) => i !== index),
    );
  }

  protected setRequestTimeout(index: number, event: Event): void {
    const node = this.node();
    const timeout = optional(event);
    const requests = node?.requests ?? [];
    if (!node || timeout === requests[index]?.timeout) return;
    this.setRequests(
      node,
      requests.map((r, i): Request => {
        if (i !== index) return r;
        return timeout === undefined ? { name: r.name } : { ...r, timeout };
      }),
    );
  }

  protected removeRequest(index: number): void {
    const node = this.node();
    if (node)
      this.setRequests(
        node,
        (node.requests ?? []).filter((_, i) => i !== index),
      );
  }

  private setRequests(node: DiagramNode, requests: Request[]): void {
    this.store.updateNode(node.id, { requests: requests.length ? requests : undefined });
  }

  /** Events worth offering for a transition: the outcomes of requests, and scheduled timeouts. */
  protected readonly eventSuggestions = computed(() =>
    this.store
      .nodes()
      .flatMap((n) => [
        ...(n.requests ?? []).flatMap((r) => REQUEST_OUTCOMES.map((o) => requestEvent(r.name, o))),
        ...(n.timers ?? []).filter((t) => t.action === 'schedule').map((t) => t.name),
        ...(n.type === 'join' ? [n.name] : []),
      ]),
  );

  protected eventEnds(outcome: string): boolean {
    return !!this.edge()?.event?.endsWith(`.${outcome}`);
  }

  /** Names of the states whose request the selected transition's event answers. */
  protected readonly requesters = computed(() => {
    const event = this.edge()?.event;
    if (!event) return [];
    return this.store
      .nodes()
      .filter((n) =>
        n.requests?.some((r) => REQUEST_OUTCOMES.some((o) => requestEvent(r.name, o) === event)),
      )
      .map((n) => n.name);
  });

  protected addTimer(action: Timer['action']): void {
    const node = this.node();
    if (!node) return;
    const timer: Timer =
      action === 'schedule'
        ? { action, name: 'SomethingTimedOut', delay: '30s' }
        : { action, name: 'SomethingTimedOut' };
    this.setTimers(node, [...(node.timers ?? []), timer]);
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.timer .name');
        const last = inputs[inputs.length - 1];
        last?.focus();
        last?.select();
      },
      { injector: this.injector },
    );
  }

  /** An empty name removes the timer. */
  protected setTimerName(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const timers = node?.timers ?? [];
    if (!node || name === timers[index]?.name) return;
    this.setTimers(
      node,
      name
        ? timers.map((t, i) => (i === index ? { ...t, name } : t))
        : timers.filter((_, i) => i !== index),
    );
  }

  protected setTimerDelay(index: number, event: Event): void {
    const node = this.node();
    const delay = optional(event);
    const timers = node?.timers ?? [];
    if (!node || delay === timers[index]?.delay) return;
    this.setTimers(
      node,
      timers.map((t, i) => (i === index ? withoutUndefinedDelay({ ...t, delay }) : t)),
    );
  }

  protected removeTimer(index: number): void {
    const node = this.node();
    if (node)
      this.setTimers(
        node,
        (node.timers ?? []).filter((_, i) => i !== index),
      );
  }

  private setTimers(node: DiagramNode, timers: Timer[]): void {
    this.store.updateNode(node.id, { timers: timers.length ? timers : undefined });
  }

  protected addCombine(): void {
    const node = this.node();
    if (!node) return;
    this.setCombines(node, [...(node.combines ?? []), 'SomethingHappened']);
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.combine input');
        const last = inputs[inputs.length - 1];
        last?.focus();
        last?.select();
      },
      { injector: this.injector },
    );
  }

  /** An empty name removes the event. */
  protected setCombine(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const combines = node?.combines ?? [];
    if (!node || name === combines[index]) return;
    this.setCombines(
      node,
      name
        ? combines.map((e, i) => (i === index ? name : e))
        : combines.filter((_, i) => i !== index),
    );
  }

  protected removeCombine(index: number): void {
    const node = this.node();
    if (node)
      this.setCombines(
        node,
        (node.combines ?? []).filter((_, i) => i !== index),
      );
  }

  private setCombines(node: DiagramNode, combines: string[]): void {
    this.store.updateNode(node.id, { combines: combines.length ? combines : undefined });
  }

  /** The join whose composite event the selected transition reacts to. */
  protected readonly joinOfEvent = computed(() => {
    const event = this.edge()?.event;
    return event
      ? this.store.nodes().find((n) => n.type === 'join' && n.name === event)
      : undefined;
  });

  protected addIgnore(): void {
    const node = this.node();
    if (!node) return;
    this.setIgnores(node, [...(node.ignores ?? []), 'SomethingHappened']);
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>('.ignore input');
        const last = inputs[inputs.length - 1];
        last?.focus();
        last?.select();
      },
      { injector: this.injector },
    );
  }

  /** An empty name removes the ignored event. */
  protected setIgnore(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const ignores = node?.ignores ?? [];
    if (!node || name === ignores[index]) return;
    this.setIgnores(
      node,
      name
        ? ignores.map((e, i) => (i === index ? name : e))
        : ignores.filter((_, i) => i !== index),
    );
  }

  protected removeIgnore(index: number): void {
    const node = this.node();
    if (node)
      this.setIgnores(
        node,
        (node.ignores ?? []).filter((_, i) => i !== index),
      );
  }

  private setIgnores(node: DiagramNode, ignores: string[]): void {
    this.store.updateNode(node.id, { ignores: ignores.length ? ignores : undefined });
  }

  private setActivities(node: DiagramNode, activities: Activity[]): void {
    this.store.updateNode(node.id, { activities: activities.length ? activities : undefined });
  }

  protected setCompensation(event: Event): void {
    const node = this.node();
    const name = optional(event);
    if (!node || name === node.compensation?.name) return;
    this.store.updateNode(node.id, {
      compensation: name ? { ...node.compensation, name } : undefined,
    });
  }

  /** Names of the states that publish the selected transition's event when entered. */
  protected readonly publishers = computed(() => {
    const event = this.edge()?.event;
    if (!event) return [];
    return this.store
      .nodes()
      .filter((n) => n.activities?.some((a) => a.kind === 'event' && a.name === event))
      .map((n) => n.name);
  });

  /** Names of the states that schedule the selected transition's event as a timeout. */
  protected readonly timeoutSchedulers = computed(() => {
    const event = this.edge()?.event;
    if (!event) return [];
    return this.store
      .nodes()
      .filter((n) => n.timers?.some((t) => t.action === 'schedule' && t.name === event))
      .map((n) => n.name);
  });

  protected setEventSource(event: Event): void {
    const edge = this.edge();
    const value = optional(event);
    if (edge && value !== edge.eventSource) this.store.updateEdge(edge.id, { eventSource: value });
  }

  protected setGuard(event: Event): void {
    const edge = this.edge();
    const value = optional(event);
    if (edge && value !== edge.guard) this.store.updateEdge(edge.id, { guard: value });
  }

  protected setEvent(event: Event): void {
    const edge = this.edge();
    const value = optional(event);
    if (edge && value !== edge.event) this.store.updateEdge(edge.id, { event: value });
  }

  protected setKind(event: Event): void {
    const edge = this.edge();
    const kind = (event.target as HTMLSelectElement).value as EdgeKind;
    if (edge && kind !== edge.kind) this.store.updateEdge(edge.id, { kind });
  }
}

/** Trimmed field value, or `undefined` when empty. */
function optional(event: Event): string | undefined {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value.trim();
  return value === '' ? undefined : value;
}

function withoutUndefinedDelay(timer: Timer): Timer {
  if (timer.delay === undefined) {
    const { delay, ...rest } = timer;
    void delay;
    return rest;
  }
  return timer;
}
