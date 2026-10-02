import { MessageKind, NodeType } from '../model/diagram';
import { IconName } from './icon';

export interface NodeTypeInfo {
  label: string;
  icon: IconName;
  description: string;
}

export const NODE_TYPES: Record<NodeType, NodeTypeInfo> = {
  start: { label: 'Initial', icon: 'start', description: 'Where the saga begins.' },
  state: {
    label: 'State',
    icon: 'step',
    description: 'Waits for events; each event leads on through a transition.',
  },
  end: { label: 'Final', icon: 'end', description: 'The saga is finished.' },
};

/** How a state that several transitions leave is shown: it decides by the event it receives. */
export const DECISION: NodeTypeInfo = {
  label: 'Decision',
  icon: 'decision',
  description: 'Branches on the event it receives.',
};

/** What a transition does with a message: send a command, publish an event. */
export const ACTIVITY_VERBS: Record<MessageKind, string> = { command: 'Send', event: 'Publish' };

/** Types offered by an add button: after a state, or in the middle of a transition. */
export const APPEND_TYPES: readonly NodeType[] = ['state', 'end'];
export const INSERT_TYPES: readonly NodeType[] = ['state'];
