# Payment Retries

## Diagram

```mermaid
---
title: "Payment Retries"
---
stateDiagram-v2
  accTitle: Payment Retries
  accDescr: 10 states and 18 transitions, from Initial to Final.
  direction TB
  [*] --> CheckingFraud : PaymentRequested / Send CheckForFraud
  CheckingFraud --> Authorising : FraudCheckPassed / Send Authorise
  CheckingFraud --> InReview : FraudCheckHeld
  InReview --> Authorising : ReviewApproved / Send Authorise
  InReview --> Failed : ReviewRejected / Publish PaymentFailed, Send NotifyMerchant
  Authorising --> Capturing : AuthorisationApproved / Send Capture
  Authorising --> Failed : AuthorisationDeclined / Publish PaymentFailed, Send NotifyMerchant
  Authorising --> WaitingToRetry : AuthorisationFailed [context.Message.Attempt < MaxTries] / Send ScheduleRetry
  Authorising --> Failed : AuthorisationFailed [context.Message.Attempt >= MaxTries] / Publish PaymentFailed, Send NotifyMerchant
  Authorising --> WaitingToRetry : ProviderTimedOut [context.Message.Attempt < MaxTries] / Send ScheduleRetry
  Authorising --> Failed : ProviderTimedOut [context.Message.Attempt >= MaxTries] / Publish PaymentFailed, Send NotifyMerchant
  WaitingToRetry --> Authorising : RetryDue / Send Authorise
  Capturing --> Captured : CaptureCompleted / Publish PaymentCaptured
  Capturing --> Failed : CaptureFailed / Publish PaymentFailed, Send NotifyMerchant
  Captured --> Refunding : RefundRequested / Send IssueRefund
  Captured --> Final : SettlementClosed
  Refunding --> Final : RefundCompleted
  Failed --> Final : MerchantNotified
  Final --> [*]
  note right of CheckingFraud : Ignores PaymentRequested
  note right of Authorising : Ignores PaymentRequested
```

## States

| State | Type | Description | Activities | Ignores | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |  |
| CheckingFraud | Decision |  | Send CheckForFraud | PaymentRequested |  |  |  |
| InReview | Decision |  |  |  |  |  |  |
| Authorising | Decision |  | Send Authorise | PaymentRequested |  |  |  |
| WaitingToRetry | State |  | Send ScheduleRetry |  |  |  |  |
| Capturing | Decision |  | Send Capture |  |  |  |  |
| Captured | Decision |  | Publish PaymentCaptured |  |  |  |  |
| Refunding | State |  | Send IssueRefund |  |  |  |  |
| Failed | State |  | Publish PaymentFailed<br>Send NotifyMerchant |  |  |  |  |
| Final | Final |  |  |  |  |  |  |

## Transitions

| From | Event | Guard | Source | To | Kind |
| --- | --- | --- | --- | --- | --- |
| Initial | PaymentRequested |  | external | CheckingFraud | Forward |
| CheckingFraud | FraudCheckPassed |  | external | Authorising | Forward |
| CheckingFraud | FraudCheckHeld |  | external | InReview | Forward |
| InReview | ReviewApproved |  | external | Authorising | Forward |
| InReview | ReviewRejected |  | external | Failed | Forward |
| Authorising | AuthorisationApproved |  | external | Capturing | Forward |
| Authorising | AuthorisationDeclined |  | external | Failed | Forward |
| Authorising | AuthorisationFailed | context.Message.Attempt < MaxTries | external | WaitingToRetry | Forward |
| Authorising | AuthorisationFailed | context.Message.Attempt >= MaxTries | external | Failed | Forward |
| Authorising | ProviderTimedOut | context.Message.Attempt < MaxTries | external | WaitingToRetry | Forward |
| Authorising | ProviderTimedOut | context.Message.Attempt >= MaxTries | external | Failed | Forward |
| WaitingToRetry | RetryDue |  | external | Authorising | Forward |
| Capturing | CaptureCompleted |  | external | Captured | Forward |
| Capturing | CaptureFailed |  | external | Failed | Forward |
| Captured | RefundRequested |  | external | Refunding | Forward |
| Captured | SettlementClosed |  | external | Final | Forward |
| Refunding | RefundCompleted |  | external | Final | Forward |
| Failed | MerchantNotified |  | external | Final | Forward |

## Commands

| Command | Sent in |
| --- | --- |
| Authorise | Authorising |
| Capture | Capturing |
| CheckForFraud | CheckingFraud |
| IssueRefund | Refunding |
| NotifyMerchant | Failed |
| ScheduleRetry | WaitingToRetry |

## Events

| Event | Origin | Published in | Triggers |
| --- | --- | --- | --- |
| AuthorisationApproved | External |  | Authorising → Capturing |
| AuthorisationDeclined | External |  | Authorising → Failed |
| AuthorisationFailed | External |  | Authorising → WaitingToRetry<br>Authorising → Failed |
| CaptureCompleted | External |  | Capturing → Captured |
| CaptureFailed | External |  | Capturing → Failed |
| FraudCheckHeld | External |  | CheckingFraud → InReview |
| FraudCheckPassed | External |  | CheckingFraud → Authorising |
| MerchantNotified | External |  | Failed → Final |
| PaymentCaptured | Internal | Captured |  |
| PaymentFailed | Internal | Failed |  |
| PaymentRequested | External |  | Initial → CheckingFraud |
| ProviderTimedOut | External |  | Authorising → WaitingToRetry<br>Authorising → Failed |
| RefundCompleted | External |  | Refunding → Final |
| RefundRequested | External |  | Captured → Refunding |
| RetryDue | External |  | WaitingToRetry → Authorising |
| ReviewApproved | External |  | InReview → Authorising |
| ReviewRejected | External |  | InReview → Failed |
| SettlementClosed | External |  | Captured → Final |
