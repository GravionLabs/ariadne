# Loan application

Handles a loan application through three checks and a decision, with a person to review the unclear cases and an offer that lapses if it is not accepted.

## The process

A submitted application starts a **credit check**, an **identity check** and an **income check** at the same time. Each has its own time limit: if one answer does not come, the scheduler sends a timeout event and the application is **withdrawn**, with the applicant told.

When all three checks are in, in whatever order, the **scoring service** decides, and reports `Approved`, `Referred` or `Declined` in `ScoringCompleted`. One event, three ways on:

- **Approved:** an offer is prepared.
- **Referred:** a reviewer is assigned, and `ReviewCompleted` says whether the application is approved (an offer follows) or declined.
- **Declined:** the application ends with a notice to the applicant.

An **offer** waits for the applicant. If it is accepted the funds are **disbursed** and the saga ends; if `OfferExpired` arrives first, the application is withdrawn.

## What it shows

- **Guards on one event:** `When(ScoringCompleted, context => context.Message.Outcome == "Approved")` and two more, which the diagram shows as three conditional transitions.
- **`IfElse` for a decision with two outcomes:** after the review, `IfElse(context => context.Message.Approved, …)` shows as two conditional transitions, the second with the opposite guard.
- **A join:** `CompositeEvent(() => ChecksCompleted, …)` waits for the three answers, which the diagram shows as three transitions into a join and one out of it.
- **A time limit on each check,** as events from the scheduler.
- A decision that goes to a person, and comes back.
- Declined and withdrawn applications each publish what happened and tell the applicant before they end.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`LoanApplicationStateMachine.cs`](LoanApplicationStateMachine.cs). The diagram is [`loan-application.saga.yaml`](loan-application.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`loan-application.docs.md`](loan-application.docs.md).
