# Customer onboarding

Onboards a new customer: verify the e-mail address, check identity with an outside provider, activate the account and send a welcome sequence.

## The process

A sign-up sends a **verification e-mail** and the saga waits for the customer to click the link. Nobody can be sure they will, so time is part of the process:

- After **24 hours** the scheduler sends `ReminderDue` and the saga sends a reminder.
- After **7 days** it sends `VerificationExpired`, and the sign-up is **abandoned**: the saga publishes `SignUpAbandoned` and asks for the leftovers to be cleaned up before it ends.

A verified address starts the **identity check** with an outside provider (KYC). The check is a **request** with a two-day time limit. The provider's answer says whether the customer is approved; a rejection, a failed request or silence (`TimeoutExpired`) **declines** the customer, who is sent a notice. An approval **activates the account**, and the saga publishes `CustomerOnboarded` and starts the **welcome sequence**, which tells it when it is done.

## What it shows

- Timeouts as events: the reminder and the expiry arrive from the scheduler, and a reminder does not end the wait (`Reminded` still accepts the verification).
- The same event (`EmailVerified`) handled in two states.
- Several ways to end: onboarded, abandoned, declined; each tells someone before the saga finishes.
- **A request to an outside service:** `Request(() => IdentityCheck, …)` sends the check and the saga waits for `IdentityCheck.Completed`, `.Faulted` or `.TimeoutExpired`, which the diagram shows as the three ways out of the state (a reply, a fault and a clock).
- **`IfElse` on the answer:** approved activates the account, otherwise the customer is declined.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`CustomerOnboardingStateMachine.cs`](CustomerOnboardingStateMachine.cs). The diagram is [`customer-onboarding.saga.yaml`](customer-onboarding.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`customer-onboarding.docs.md`](customer-onboarding.docs.md).
