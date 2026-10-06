# ADR 0024: Authoring in place: ask where a state is added, edit where it is shown

- Status: accepted
- Date: 2026-10-06
- Issues: #404, #405, #406, #407, #408, #409, #410, #411, #412, #413, #414
- Builds on: [ADR 0003](0003-auto-layout-commands-events.md), [ADR 0005](0005-activities-on-states.md),
  [ADR 0023](0023-routing-slips.md)

## Context

The common edit is "on PaymentCharged, go to Charged": a state, its name, and an event on its transition. In the
editor that took three selections: "+" added a state named `State` after a transition with no event, then the
inspector renamed the state, then the bare transition line had to be found and selected to type the event. Nothing on
the canvas could be edited, the state inspector showed up to eight sections of which most were empty, and the
keyboard could move around and delete but not add.

## Decision

- **One popover asks for the event and the name.** "+" opens it directly for a state, with a switch for a join or a
  final state (so there is still one popover, and one click for the common case). `Enter` adds state, transition,
  event and name as one undo step; `Esc`, or empty fields, add the defaults. The same prompt (`app-state-prompt`) serves
  the "+" after a state and on a transition, the inspector's "To a new state" / "To a final state" and the keyboard.
  On a transition A → B the event asked for is the one of the new state to B; the one into the new state keeps its own.
- **Names and events are edited where they are shown.** Double-click or `F2` turns a state's name or a transition's
  event into a text field (`app-inline-edit`); `Enter` or blur commits as one undo step, `Esc` cancels. Not while
  walking through or viewing a path. A transition's event is also a field in the state's Transitions list; an edit
  that would duplicate another transition (same states, kind, event and guard) is refused and the old value put back.
- **A missing event is visible, and its room is reserved.** A forward transition without an event shows a faint
  "+ event" chip where its label would be; it is not drawn in view mode, the walkthrough, the exports and the viewer.
  Because the layout (`labelSize` in `@ariadne/core`) reserves the room of a one-row card for such a transition, giving
  it an event does not move the diagram. The exports and the viewer therefore lay out like the editor, without the chip.
- **Suggestions know the source state** (`suggestEvents`): what its own requests, routing slips and timers make
  possible first, then the same for the other states, joins, events the saga publishes, events of other transitions and
  the events known from a C# import. An event another transition leaving the same state already reacts to is left out.
- **Outcomes behave the same for requests, scheduled timeouts and routing slips.** "Add transitions for its outcomes"
  adds one transition to a new state per outcome the state does not react to yet, with the event filled in, as one
  undo step (`addOutcomeTransitions`). (#399 only suggested the events of routing slips.)
- **The state inspector shows what has content.** Details, Activities and Transitions are always shown; requests,
  routing slips, timers, ignored events and recovery appear when the state has entries, and "Add behavior…" lists the
  hidden ones and shows the picked one with a new entry focused.
- **Keys:** with a state selected `N` adds a state after it (through the prompt), `F` a final state; f-flow's `C`
  connects to an existing state; with a transition selected `E` edits its event. They do nothing in a field, while
  walking, or with a modifier held.

## Consequences

- Every edit above goes through `@ariadne/core` (`appendNode` and `insertOnEdge` with an init, `setEdgeEvent`,
  `addOutcomeTransitions`, `suggestEvents`), so it is one undo step and testable without Angular.
- The layout of diagrams with transitions that have no event changes (more room along those lines), in the editor and
  in the exports alike; nothing in the file format changes.
- Escape in the add popover adds the default state rather than cancelling: the type was already chosen, and the
  keyboard user's fastest "just add one" is `N`, `Esc`. A click outside the popover cancels.
