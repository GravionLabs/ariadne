import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  Activity,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  MessageKind,
  NODE_COLORS,
  NodeColor,
  NodeType,
} from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { namingHint } from '../model/messages';
import { Icon } from './icon';
import { DECISION, NODE_TYPES } from './node-types';

const NEW_MESSAGE: Record<MessageKind, string> = {
  command: 'DoSomething',
  event: 'SomethingHappened',
};

/**
 * Edits the selected state or transition. Fields commit on `change` (blur or Enter), so every edit is
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

  readonly node = input<DiagramNode>();
  readonly edge = input<DiagramEdge>();
  /** The selected state has several transitions. */
  readonly decision = input(false);
  readonly closed = output<void>();
  readonly deleted = output<void>();
  /** "Add transition": a new state of this type should follow the selected one. */
  readonly transitionAdded = output<NodeType>();

  protected readonly namingHint = namingHint;
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

  protected setCompensation(event: Event): void {
    const node = this.node();
    const name = optional(event);
    if (!node || name === node.compensation?.name) return;
    this.store.updateNode(node.id, {
      compensation: name ? { ...node.compensation, name } : undefined,
    });
  }

  protected addActivity(kind: MessageKind): void {
    const edge = this.edge();
    if (!edge) return;
    this.setActivities(edge, [...(edge.activities ?? []), { kind, name: NEW_MESSAGE[kind] }]);
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
    const edge = this.edge();
    const activities = edge?.activities ?? [];
    if (!edge || activities[index]?.kind === kind) return;
    this.setActivities(
      edge,
      activities.map((a, i) => (i === index ? { ...a, kind } : a)),
    );
  }

  protected setActivityName(index: number, event: Event): void {
    const edge = this.edge();
    const name = optional(event);
    const activities = edge?.activities ?? [];
    if (!edge || name === activities[index]?.name) return;
    // An empty name removes the activity.
    this.setActivities(
      edge,
      name
        ? activities.map((a, i) => (i === index ? { ...a, name } : a))
        : activities.filter((_, i) => i !== index),
    );
  }

  protected removeActivity(index: number): void {
    const edge = this.edge();
    if (edge)
      this.setActivities(
        edge,
        (edge.activities ?? []).filter((_, i) => i !== index),
      );
  }

  private setActivities(edge: DiagramEdge, activities: Activity[]): void {
    this.store.updateEdge(edge.id, { activities: activities.length ? activities : undefined });
  }

  /** Transitions (as "From → To") that publish the selected transition's event. */
  protected readonly publishers = computed(() => {
    const event = this.edge()?.event;
    if (!event) return [];
    const name = (id: string) => this.store.nodes().find((n) => n.id === id)?.name ?? id;
    return this.store
      .edges()
      .filter((e) => e.activities?.some((a) => a.kind === 'event' && a.name === event))
      .map((e) => `${name(e.source)} → ${name(e.target)}`);
  });

  protected setEventSource(event: Event): void {
    const edge = this.edge();
    const value = optional(event);
    if (edge && value !== edge.eventSource) this.store.updateEdge(edge.id, { eventSource: value });
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
