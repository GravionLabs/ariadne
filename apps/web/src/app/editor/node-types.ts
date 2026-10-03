import { IconName } from './icon';
import { DECISION_INFO, NODE_INFO, NodeType } from '@ariadne/core';

export interface NodeTypeInfo {
  label: string;
  icon: IconName;
  description: string;
}

const ICONS: Record<NodeType, IconName> = {
  start: 'start',
  state: 'step',
  end: 'end',
  join: 'join',
  any: 'any',
};

export const NODE_TYPES: Record<NodeType, NodeTypeInfo> = Object.fromEntries(
  (Object.keys(NODE_INFO) as NodeType[]).map((type) => [
    type,
    { ...NODE_INFO[type], icon: ICONS[type] },
  ]),
) as Record<NodeType, NodeTypeInfo>;

/** How a state that several transitions leave is shown: it decides by the event it receives. */
export const DECISION: NodeTypeInfo = { ...DECISION_INFO, icon: 'decision' };

/** Types offered by an add button: after a state, or in the middle of a transition. */
export const APPEND_TYPES: readonly NodeType[] = ['state', 'join', 'end'];
export const INSERT_TYPES: readonly NodeType[] = ['state', 'join'];
