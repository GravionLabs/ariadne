# Loan application

Handles a loan application through three checks and a decision, with a person to review the unclear cases and an offer that lapses if it is not accepted.

## The process

A submitted application starts a **credit check**, then an **identity check**, then an **income check**. Each has its own time limit: if the answer does not come, the scheduler sends a timeout event and the application is **withdrawn**, with the applicant told.

When the three checks are in, the **scoring service** decides, and reports `Approved`, `Referred` or `Declined` in `ScoringCompleted`. One event, three ways on:

- **Approved:** an offer is prepared.
- **Referred:** a reviewer is assigned, and `ReviewCompleted` says whether the application is approved (an offer follows) or declined.
- **Declined:** the application ends with a notice to the applicant.

An **offer** waits for the applicant. If it is accepted the funds are **disbursed** and the saga ends; if `OfferExpired` arrives first, the application is withdrawn.

## What it shows

- **Guards on one event:** `When(ScoringCompleted, context => context.Message.Outcome == "Approved")` and two more, which the diagram shows as three conditional transitions.
- **A time limit on each wait,** as events from the scheduler.
- A decision that goes to a person, and comes back.
- Declined and withdrawn applications each publish what happened and tell the applicant before they end.

The three checks run one after the other here. A saga could wait for all three at once with a composite event (MassTransit's `CompositeEvent`, a join in the diagram), but Ariadne does not read or generate that yet, so the sample does not use it.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`LoanApplicationStateMachine.cs`](LoanApplicationStateMachine.cs). The diagram is [`loan-application.saga.yaml`](loan-application.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`loan-application.docs.md`](loan-application.docs.md).
