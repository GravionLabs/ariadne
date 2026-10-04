# Sample library

Sagas as a team would write them: hand-written MassTransit 8 C#, the diagram Ariadne reads from it, the C#
Ariadne generates from that diagram, and a documentation page. Each sample is checked from end to end by
`packages/masstransit/src/library.spec.ts` and compiled against MassTransit by `scripts/compile-generated.sh`.

| Sample                                               | Domain   | What it shows                                                                                                 |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| [order-fulfilment](order-fulfilment/README.md)       | Shop     | Stock, payment and shipping; stock given back when payment is declined; a late delivery; cancelling any time  |
| [payment-retries](payment-retries/README.md)         | Payments | A fraud check and manual review, retries after a wait up to three tries (guards), refunds, provider timeouts  |
| [customer-onboarding](customer-onboarding/README.md) | Accounts | A reminder after a day and giving up after a week, an outside identity check, abandoned and declined sign-ups |
| [trip-booking](trip-booking/README.md)               | Travel   | Flight, hotel and car one after the other; the bookings already made are cancelled in reverse order           |
| [loan-application](loan-application/README.md)       | Lending  | Three checks with a time limit each, a decision with three ways on, a manual review, an offer that lapses     |

## What is in a sample folder

| File               | What it is                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| `README.md`        | The story: the process, what each state waits for, what can go wrong, what it shows |
| `*.cs`             | The saga, its instance and its messages, **written by hand**                        |
| `<name>.saga.yaml` | The diagram the importer reads from that C#                                         |
| `generated/`       | The C# the generator writes for that diagram                                        |
| `<name>.docs.md`   | The Markdown page of the diagram (`ariadne export --format md`)                     |

## Change a sample

Edit the hand-written C#, then rewrite the three derived files from it:

```sh
pnpm --filter @ariadne/cli build
node scripts/update-library.mjs              # every sample, or: node scripts/update-library.mjs order-fulfilment
pnpm --filter @ariadne/masstransit test      # the checks
scripts/compile-generated.sh                 # compiles every sample against MassTransit (needs the .NET SDK)
```

The tests fail with that command in their message when a derived file is not what the script writes.

## Add a sample

Make `samples/library/<name>/` (kebab-case) with the C# and a `README.md` that starts with the saga's title as a
heading, then a paragraph that says in one sentence what the saga does. Run the script above. The tests, the compile
script and the list in the user guide pick the folder up; this table is the one thing to add by hand.

## What a sample can use

The importer reads what a diagram can show: `Initially`, `During`, `DuringAny`, `WhenEnter`, `When(Event)` with an
optional filter (a guard), `Send`, `Publish`, `TransitionTo`, `Finalize` and `Ignore`. The tests require that the
import gives **no warning**, so a sample leaves out what is not read yet:

- `Request`, `Schedule`, `CompositeEvent` (a join), `If`/`IfElse` and code in `Then(...)`. A timeout is an event the
  scheduler sends (`ReminderDue`), a wait for several things is a chain of states, and a condition is a filter on
  `When`.
- Anything that happens on the way into the final state (`.Publish(...).Finalize()`): nothing can be shown there.
  A sample publishes when it enters an ordinary state (`WhenEnter`), and an event finalizes it later.
