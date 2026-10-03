import { NodeType } from './diagram';

/** What a kind of node is called and what it means, for labels in the editor and in exports. */
export interface NodeInfo {
  label: string;
  description: string;
}

export const NODE_INFO: Record<NodeType, NodeInfo> = {
  start: { label: 'Initial', description: 'Where the saga begins.' },
  state: {
    label: 'State',
    description: 'Waits for events; each event leads on through a transition.',
  },
  end: { label: 'Final', description: 'The saga is finished.' },
  join: { label: 'Join', description: 'Waits until several events have all arrived.' },
  any: { label: 'Any state', description: 'Transitions that apply in every state.' },
};

/** How a state that several transitions leave is shown: it decides by the event it receives. */
export const DECISION_INFO: NodeInfo = {
  label: 'Decision',
  description: 'Branches on the event it receives.',
};
