# ADR 0012: Validation, message catalog and walkthrough

- Status: accepted
- Date: 2026-10-03
- Issues: #147, #148, #150, #159, #160, #161
- Builds on: [ADR 0004](0004-ngrx-signal-store.md) (stores per concern), [ADR 0005](0005-activities-on-states.md)

## Context

A diagram is documentation. Three things help people read and trust it beyond the picture: being
told about modelling mistakes, seeing which messages exist and where they are used, and following the
saga event by event in a review.

## Decision

1. **Validation is a pure function, `validate(diagram): Finding[]`** (`model/validation.ts`). A finding has
   a severity (`error`, `warning`, `info`), a stable rule code, a message and the id of the node or
   transition it is about (none for the diagram as a whole). It reads only the diagram and follows its
   order, so a CLI or an editor extension can report the same findings later; the web app is the first
   user. The rules are documentation-quality checks, not compiler errors:
   - **error:** no or several initial states, an unreachable state, a transition into the initial state;
   - **warning:** a state with no way to a final state, the same event twice out of one state without
     guards that tell the transitions apart, a transition without an event (except out of the initial
     state);
   - **info:** an outside event without a source, naming hints (imperative commands, past-tense events).
     Reachability counts the Any node as a starting point, since its transitions apply in every state;
     compensation transitions count for reachability but not for "can finish". Events with a fixed name
     (timeouts, replies, faults, joins) get no naming hint.
2. **The editor shows findings in two places.** A "Problems" button in the toolbox counts them by severity
   and lists them; picking one selects the element and centres it. The worst severity per element is also
   a marker on the canvas: a dot on a state, a coloured edge on a transition's label, and an error or
   warning colour on its line (hints leave the line alone, they would be everywhere). The findings are a
   computed of `EditorStore`.
3. **The message catalog is derived, never stored** (`model/catalog.ts`): the commands and events of the
   diagram with their origin, sources, the states that send or publish them and the transitions that
   react to them. Picking an entry emphasises those states and transitions (`EditorStore.highlight`;
   everything else fades). Renaming a message renames it everywhere as one undo step
   (`DiagramStore.renameMessage`); a name another message of the same kind already has is refused rather
   than merging the two. Events whose name comes from somewhere else (a timeout, the answer to a
   request, a join) are shown but named where they are defined.
4. **The walkthrough is a mode with its own store** (`WalkthroughStore`, provided by `Editor`): the path is
   the list of transitions taken, from the initial state. Each step offers the transitions that leave the
   current state plus those of the Any node (not in the initial or a final state); a join is passed once
   reached. The current state's activities, requests and timers are shown, and the path can be copied as
   text. It is **read-only**: while it runs the inspector, the "+" buttons, the toolbox edit buttons and the
   keyboard shortcuts are off, and the saga's name is locked. If the diagram changes anyway (the source
   text) and the path no longer holds, the walk ends.
5. **One panel on the left at a time:** the catalog and the walkthrough float under the saga's name and
   replace each other. Leaving a walkthrough ends it.

## Consequences

- The rules are cheap to run on every change (a few passes over the nodes and transitions) and are covered
  by one spec per rule, plus a check that the two example sagas have no errors or warnings.
- Nothing about validation, the catalog or the walkthrough is saved in the file: they are views of the
  diagram.
- The rules live in `src/app/model` for now. When the code moves into the planned shared packages
  (epic #162) they belong in the core package with the parser and the format.
- A walkthrough ignores guards (it offers every transition of the event) and does not model several
  events arriving for a join: it is a reading aid, not a simulation. Documentation only, as in ADR 0001.
