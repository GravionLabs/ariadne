# Getting started

## Open the editor

- **Hosted by your team:** open the address they gave you. See [self-hosting](../self-hosting.md) to run it
  yourself with one `docker run`.
- **From the repository:** `pnpm install`, then `pnpm start`, and open <http://localhost:4200>.

## Look at a sample

Choose **New** and, under "Or start from a sample", the _Order saga_. It opens as a new diagram that is not saved
anywhere yet. Click a state or a transition: the inspector on the right shows what it is. **Walkthrough** steps
through the saga event by event, and **Messages** lists its commands and events and where they are used.

## Draw your own

1. **New**, give the saga a name.
2. Click the **+** under the initial state and pick a state. Click **+** again to continue the path.
3. To add a state _into_ an existing path, click the **+** on a transition.
4. Drag from a state's connector onto another state to add a transition (for a loop, a retry or a branch back).
5. Select a transition and give it an **event**, e.g. `PaymentCharged`. Select a state and add **activities**: the
   commands it sends and the events it publishes when the saga enters it.

Nothing is positioned by hand; the layout follows the structure. **Top to bottom** and **Left to right** switch the
direction.

## Save

**Save** (`Ctrl+S`) writes a `*.saga.yaml` file. In Chrome and Edge it overwrites the file you opened; in other
browsers it downloads a copy. The file is plain YAML, made for code review: keys are always in the same order, so
a change shows up as a small diff. Put it in your repository next to the saga's code.

The **Source** button shows the YAML next to the diagram. You can edit either side; a mistake in the text is shown
with its line and column and the diagram keeps its last valid state.

## Next

[Modelling sagas](modelling.md)
