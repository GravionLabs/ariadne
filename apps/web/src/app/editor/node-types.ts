import { IconName } from './icon';
import { NodeType } from '@ariadne/core';

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
  join: {
    label: 'Join',
    icon: 'join',
    description: 'Waits until several events have all arrived.',
  },
  any: {
    label: 'Any state',
    icon: 'any',
    description: 'Transitions that apply in every state.',
  },
};

/** How a state that several transitions leave is shown: it decides by the event it receives. */
export const DECISION: NodeTypeInfo = {
  label: 'Decision',
  icon: 'decision',
  description: 'Branches on the event it receives.',
};

/** Types offered by an add button: after a state, or in the middle of a transition. */
export const APPEND_TYPES: readonly NodeType[] = ['state', 'join', 'end'];
export const INSERT_TYPES: readonly NodeType[] = ['state', 'join'];
