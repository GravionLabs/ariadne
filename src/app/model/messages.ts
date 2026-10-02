import { MessageKind } from './diagram';

/** Endings of past-tense verbs: Submitted, Taken, Shown, Built, Sent, Bought. */
const PAST_TENSE = /(ed|en|wn|lt|nt|ought)$/i;

/**
 * A soft naming hint following MassTransit's conventions, or `null` if the name looks fine:
 * commands are imperative (verb–noun, `SubmitOrder`), events past tense (noun–verb,
 * `OrderSubmitted`).
 */
export function namingHint(kind: MessageKind, name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return null;
  if (kind === 'command' && /ed$/i.test(trimmed)) {
    return 'Commands are imperative, e.g. SubmitOrder';
  }
  if (kind === 'event' && !PAST_TENSE.test(trimmed)) {
    return 'Events are past tense, e.g. OrderSubmitted';
  }
  return null;
}
