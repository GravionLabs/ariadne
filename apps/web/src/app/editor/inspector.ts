import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin } from '@angular/cdk/overlay';
import { EmbeddedSync } from '../host/embedded-sync';
import { DiagramStore } from '../model/diagram-store';
import { DiagramLayout } from './diagram-layout';
import { EditorStore } from './editor-store';
import { NewStep } from './add-step-button';
import { Icon, IconName } from './icon';
import { StatePrompt } from './state-prompt';
import { DECISION, NODE_TYPES } from './node-types';
import {
  Activity,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  eventLabel,
  hasActivities,
  hasIgnores,
  hasInput,
  hasRequests,
  hasTimers,
  joinEventsOf,
  MessageKind,
  namingHint,
  NODE_COLORS,
  NodeColor,
  NodeType,
  Request,
  REQUEST_OUTCOMES,
  requestEvent,
  sameTransition,
  Timer,
  RoutingSlip,
  SLIP_OUTCOMES,
  compensationOrder,
  hasRoutingSlips,
  missingOutcomes,
  OutcomeSource,
  outcomeEvents,
  suggestEvents,
  slipEvent,
} from '@ariadne/core';

/** Inspector sections that start expanded even when empty. */
const ALWAYS_OPEN = ['details', 'activities', 'transitions'];

type BehaviourKey = 'requests' | 'slips' | 'timers' | 'ignores' | 'recovery';

/** The optional sections of a state, as "Add behaviour…" names them. */
const BEHAVIOURS: readonly { key: BehaviourKey; label: string; icon: IconName }[] = [
  { key: 'requests', label: 'Request', icon: 'command' },
  { key: 'slips', label: 'Routing slip', icon: 'route' },
  { key: 'timers', label: 'Timer', icon: 'clock' },
  { key: 'ignores', label: 'Ignored event', icon: 'ignore' },
  { key: 'recovery', label: 'Recovery', icon: 'compensation' },
];

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
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, Icon, StatePrompt],
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
  private readonly sync = inject(EmbeddedSync);

  /** "Go to code" for the selected state or transition; only when the diagram names its C# file. */
  protected readonly canGoToCode = computed(
    () => this.sync.canGoToCode() && (this.node()?.type === 'state' || !!this.edge()),
  );

  /** The selected state or transition, from the editor's selection. */
  protected readonly node = this.editor.selectedNode;
  protected readonly edge = this.editor.selectedEdge;

  protected goToCode(): void {
    const node = this.node();
    const edge = this.edge();
    if (node) this.sync.goToCode({ kind: 'state', id: node.id });
    else if (edge) this.sync.goToCode({ kind: 'transition', id: edge.id });
  }
  /** The selected state has several transitions. */
  protected readonly decision = computed(() => {
    const node = this.node();
    return !!node && this.layout.decisions().has(node.id);
  });
  readonly closed = output<void>();
  readonly deleted = output<void>();
  /** "Add transition": a new state of this type should follow the selected one. */
  readonly transitionAdded = output<NewStep>();

  /** The "To a new state" / "To a final state" button whose prompt is open. */
  protected readonly prompting = signal<{ type: NodeType; origin: CdkOverlayOrigin } | null>(null);

  protected addTransition({ type, init }: NewStep): void {
    this.prompting.set(null);
    this.transitionAdded.emit({ type, init });
  }

  private readonly selected = computed(() => this.node()?.id ?? this.edge()?.id);

  constructor() {
    // Another state or transition: sections go back to their defaults.
    effect(() => {
      this.selected();
      untracked(() => {
        this.toggled.set({});
        this.revealed.set(false);
        this.menuOpen.set(false);
      });
    });
  }

  protected readonly namingHint = namingHint;
  protected readonly hasActivities = hasActivities;
  protected readonly hasIgnores = hasIgnores;
  protected readonly hasTimers = hasTimers;
  protected readonly hasRequests = hasRequests;
  protected readonly hasRoutingSlips = hasRoutingSlips;
  protected readonly compensationOrder = compensationOrder;
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

  /** Behaviours of a state that have a section of their own once it has any. */
  protected readonly behaviours = BEHAVIOURS;

  /** Recovery has no list to be empty: asking for it from the menu is what shows it while it has nothing. */
  private readonly revealed = signal(false);
  protected readonly menuOpen = signal(false);

  /** The optional sections the selected state shows: those with content, and Recovery once asked for. */
  protected readonly shown = computed(() => {
    const node = this.node();
    const shown = new Set<BehaviourKey>();
    if (!node) return shown;
    if (node.requests?.length) shown.add('requests');
    if (node.routingSlips?.length) shown.add('slips');
    if (node.timers?.length) shown.add('timers');
    if (node.ignores?.length) shown.add('ignores');
    if (node.compensation || node.retry || node.timeout || this.revealed()) shown.add('recovery');
    return shown;
  });

  /** What "Add behaviour…" lists: the hidden sections this kind of node supports. */
  protected readonly hiddenBehaviours = computed(() => {
    const node = this.node();
    if (!node) return [];
    const supported: Record<BehaviourKey, boolean> = {
      requests: hasRequests(node.type),
      slips: hasRoutingSlips(node.type),
      timers: hasTimers(node.type),
      ignores: hasIgnores(node.type),
      recovery: node.type === 'state',
    };
    const shown = this.shown();
    return BEHAVIOURS.filter((b) => supported[b.key] && !shown.has(b.key));
  });

  /** Shows a hidden section with a new entry in it, focused. */
  protected addBehaviour(key: BehaviourKey): void {
    this.menuOpen.set(false);
    switch (key) {
      case 'requests':
        return this.addRequest();
      case 'slips':
        return this.addRoutingSlip();
      case 'timers':
        return this.addTimer('schedule');
      case 'ignores':
        return this.addIgnore();
      case 'recovery':
        this.revealed.set(true);
        this.toggled.update((t) => ({ ...t, recovery: true }));
        this.focusLast('[aria-label="Recovery"] input', 'first');
    }
  }

  /** Escape closes the menu and nothing else (not the inspector). */
  protected closeMenu(event: Event): void {
    if (!this.menuOpen()) return;
    event.stopPropagation();
    this.menuOpen.set(false);
  }

  /** Sections the user opened or closed by hand; reset when another element is selected. */
  private readonly toggled = signal<Record<string, boolean>>({});

  /** A section with entries starts open; the main ones (activities, transitions) always do. */
  protected isOpen(key: string, count: number): boolean {
    return this.toggled()[key] ?? (count > 0 || ALWAYS_OPEN.includes(key));
  }

  protected toggle(key: string, count: number): void {
    const open = !this.isOpen(key, count);
    this.toggled.update((t) => ({ ...t, [key]: open }));
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

  // ---- routing slips (ADR 0023)

  protected addRoutingSlip(): void {
    const node = this.node();
    if (!node) return;
    this.setSlips(node, [
      ...(node.routingSlips ?? []),
      { name: 'DoTheWork', activities: [{ name: 'FirstActivity', compensates: true }] },
    ]);
    this.focusLast('.slip .slip-name');
  }

  /** An empty name removes the slip. */
  protected setSlipName(index: number, event: Event): void {
    const node = this.node();
    const name = optional(event);
    const slips = node?.routingSlips ?? [];
    if (!node || name === slips[index]?.name) return;
    this.setSlips(
      node,
      name
        ? slips.map((s, i) => (i === index ? { ...s, name } : s))
        : slips.filter((_, i) => i !== index),
    );
  }

  protected removeRoutingSlip(index: number): void {
    const node = this.node();
    if (node)
      this.setSlips(
        node,
        (node.routingSlips ?? []).filter((_, i) => i !== index),
      );
  }

  protected addSlipActivity(index: number): void {
    this.updateSlip(index, (s) => ({
      ...s,
      activities: [...s.activities, { name: 'NextActivity', compensates: true }],
    }));
    this.focusLast(`.slip[data-index="${index}"] .activity-name`);
  }

  /** An empty name removes the activity. */
  protected setSlipActivityName(index: number, at: number, event: Event): void {
    const name = optional(event);
    this.updateSlip(index, (s) => ({
      ...s,
      activities: name
        ? s.activities.map((a, j) => (j === at ? { ...a, name } : a))
        : s.activities.filter((_, j) => j !== at),
    }));
  }

  protected toggleCompensates(index: number, at: number): void {
    this.updateSlip(index, (s) => ({
      ...s,
      activities: s.activities.map((a, j) =>
        j !== at ? a : a.compensates ? { name: a.name } : { ...a, compensates: true },
      ),
    }));
  }

  /** Moves an activity one place earlier (-1) or later (+1) in the itinerary. */
  protected moveSlipActivity(index: number, at: number, by: -1 | 1): void {
    this.updateSlip(index, (s) => {
      const to = at + by;
      if (to < 0 || to >= s.activities.length) return s;
      const activities = [...s.activities];
      [activities[at], activities[to]] = [activities[to], activities[at]];
      return { ...s, activities };
    });
  }

  protected removeSlipActivity(index: number, at: number): void {
    this.updateSlip(index, (s) => ({ ...s, activities: s.activities.filter((_, j) => j !== at) }));
  }

  private updateSlip(index: number, change: (slip: RoutingSlip) => RoutingSlip): void {
    const node = this.node();
    const slips = node?.routingSlips ?? [];
    if (!node || !slips[index]) return;
    const next = change(slips[index]);
    if (next !== slips[index])
      this.setSlips(
        node,
        slips.map((s, i) => (i === index ? next : s)),
      );
  }

  private setSlips(node: DiagramNode, slips: RoutingSlip[]): void {
    this.store.updateNode(node.id, { routingSlips: slips.length ? slips : undefined });
  }

  private focusLast(selector: string, which: 'first' | 'last' = 'last'): void {
    afterNextRender(
      () => {
        const inputs = this.host.nativeElement.querySelectorAll<HTMLInputElement>(selector);
        const target = which === 'first' ? inputs[0] : inputs[inputs.length - 1];
        target?.focus();
        target?.select();
      },
      { injector: this.injector },
    );
  }

  /** Names of the states that start the routing slip whose outcome the selected transition's event is. */
  protected readonly slipStarters = computed(() => {
    const event = this.edge()?.event;
    if (!event) return [];
    return this.store
      .nodes()
      .filter((n) =>
        n.routingSlips?.some((s) => SLIP_OUTCOMES.some((o) => slipEvent(s.name, o) === event)),
      )
      .map((n) => n.name);
  });

  /**
   * Events worth offering for a transition of the selected state, or for the selected transition:
   * what its source state makes possible first (see `suggestEvents`).
   */
  protected readonly eventSuggestions = computed(() => {
    const edge = this.edge();
    return suggestEvents(this.store.diagram(), {
      from: edge?.source ?? this.node()?.id,
      edge: edge?.id,
    });
  });

  /** Names the diagram itself gives events: they need no naming hint. */
  protected readonly outcomes = computed(() => outcomeEvents(this.store.diagram()));

  /**
   * The outcomes of the selected state's requests, routing slips and scheduled timeouts that have no
   * transition yet, by row; a row with none gets no "Add transitions for its outcomes".
   */
  protected readonly missing = computed(() => {
    const node = this.node();
    const d = this.store.diagram();
    const of = (kind: OutcomeSource['kind'], rows: readonly unknown[] | undefined) =>
      (rows ?? []).map((_, index) => (node ? missingOutcomes(d, node.id, { kind, index }) : []));
    return {
      request: of('request', node?.requests),
      routingSlip: of('routingSlip', node?.routingSlips),
      timer: of('timer', node?.timers),
    };
  });

  protected addOutcomes(kind: OutcomeSource['kind'], index: number): void {
    const node = this.node();
    if (node) this.store.addOutcomeTransitions(node.id, { kind, index });
  }

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

  /** The join whose composite event the selected transition reacts to. */
  protected readonly joinOfEvent = computed(() => {
    const event = this.edge()?.event;
    return event
      ? this.store.nodes().find((n) => n.type === 'join' && n.name === event)
      : undefined;
  });

  private readonly joins = computed(() => joinEventsOf(this.store.diagram()));

  /** For a join: the events of the transitions leading into it, which it waits for. */
  protected readonly waitsFor = computed(() => this.joins().get(this.node()?.id ?? '') ?? []);

  /** The events that raise the join the selected transition leaves on. */
  protected readonly joinRaisedBy = computed(
    () => this.joins().get(this.joinOfEvent()?.id ?? '') ?? [],
  );

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

  /** States `edge` could lead to: everything that can be entered; taken ones are marked. */
  protected targetsOf(edge: DiagramEdge): { id: string; name: string; taken: boolean }[] {
    // A target is taken when another transition is the same but for its target (`sameTransition`):
    // found with one pass over the transitions, not one pass for each state.
    const taken = new Set(
      this.store
        .edges()
        .filter((e) => e.id !== edge.id && sameTransition(e, { ...edge, target: e.target }))
        .map((e) => e.target),
    );
    return this.store
      .nodes()
      .filter((n) => hasInput(n.type))
      .map((n) => ({ id: n.id, name: n.name, taken: taken.has(n.id) }));
  }

  /**
   * The possible targets of each transition leaving the selected state, by transition id. Made once
   * per change, not by a method call in the template: that made a new list of every state of the
   * saga for every transition on every change detection.
   */
  protected readonly rowTargets = computed(
    () => new Map(this.outgoing().map((e) => [e.id, this.targetsOf(e)])),
  );

  /** The selected transition's possible targets. */
  protected readonly targets = computed(() => {
    const edge = this.edge();
    return edge ? this.targetsOf(edge) : [];
  });

  protected setTarget(event: Event): void {
    const edge = this.edge();
    if (edge) this.retarget(edge, event);
  }

  /** Points `edge` at the state picked in the select; puts the old target back if refused. */
  protected retarget(edge: DiagramEdge, event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (!this.store.setEdgeTarget(edge.id, select.value)) select.value = edge.target;
  }

  /** Sets the event of a row of the Transitions list; puts the old one back if it would be a duplicate. */
  protected setRowEvent(edge: DiagramEdge, event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.store.setEdgeEvent(edge.id, input.value)) input.value = edge.event ?? '';
  }

  /** Forward transitions leaving the selected state. */
  protected readonly outgoing = computed(() => {
    const id = this.node()?.id;
    return this.store.edges().filter((e) => e.source === id && e.kind === 'forward');
  });

  /** States no event-less forward transition of the selected state leads to yet: "To an existing state". */
  protected readonly existingTargets = computed(() => {
    const node = this.node();
    if (!node) return [];
    const outgoing = this.outgoing();
    return this.store
      .nodes()
      .filter(
        (n) =>
          hasInput(n.type) &&
          !outgoing.some((e) =>
            sameTransition(e, { source: node.id, target: n.id, kind: 'forward' }),
          ),
      );
  });

  protected connectToExisting(event: Event): void {
    const node = this.node();
    const select = event.target as HTMLSelectElement;
    if (node && select.value) this.store.connect(node.id, select.value);
    select.value = '';
  }

  protected nameOf(id: string): string {
    return this.store.nodes().find((n) => n.id === id)?.name ?? id;
  }

  protected eventOf(edge: DiagramEdge): string {
    return eventLabel(edge) || 'no event yet';
  }

  /** What is known in code about the selected transition's event (shared by all with that event). */
  protected readonly eventInfo = computed(() => {
    const event = this.edge()?.event;
    return event ? this.store.diagram().events?.find((e) => e.name === event) : undefined;
  });

  protected setMessageType(event: Event): void {
    const name = this.edge()?.event;
    if (name)
      this.store.setEventInfo(name, { messageType: (event.target as HTMLInputElement).value });
  }

  protected setCorrelation(event: Event): void {
    const name = this.edge()?.event;
    if (name)
      this.store.setEventInfo(name, { correlation: (event.target as HTMLInputElement).value });
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
