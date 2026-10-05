# Payment with retries

Takes a card payment through a fraud check, authorisation and capture, retrying a failure that may pass, and refunding a captured payment until it settles.

## The process

A payment request first goes to the **fraud service**. It passes, or it is **held for a person to review**, who approves or rejects it. Then the card provider is asked to **authorise** the payment, and an authorised payment is **captured**.

The provider fails in different ways, and the saga treats them differently:

- **A hard decline** (a stolen card, no funds) ends the payment at once.
- **A failure that may pass** (a network error) is retried: the saga asks the scheduler to send `RetryDue` after five minutes, and authorises again. The provider counts the tries in the message (`Attempt`), and **after the third** the payment fails instead. The same event, `AuthorisationFailed`, therefore leads to two different states, chosen by a guard on the message.
- **No answer in time** (`ProviderTimedOut`) is handled by the same rule.

A captured payment publishes `PaymentCaptured` and stays open until the settlement closes. A refund can be requested until then. A failed payment publishes `PaymentFailed` and tells the merchant before it ends.

## What it shows

- **Guards:** `When(AuthorisationFailed, context => context.Message.Attempt < MaxTries)` and its counterpart, so one event leads to different states. In the diagram they are the conditions on the transitions.
- **Waiting and retrying:** the scheduler sends the timer as an ordinary event.
- `Ignore`: a second `PaymentRequested` while the payment is in progress is dropped without an error.
- `WhenEnter` to publish an event when a state is entered.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`PaymentRetriesStateMachine.cs`](PaymentRetriesStateMachine.cs). The diagram is [`payment-retries.saga.yaml`](payment-retries.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`payment-retries.docs.md`](payment-retries.docs.md).
