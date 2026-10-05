# Customer Onboarding

## Diagram

```mermaid
---
title: "Customer Onboarding"
---
stateDiagram-v2
  accTitle: Customer Onboarding
  accDescr: 9 states and 14 transitions, from Initial to Final.
  direction TB
  [*] --> AwaitingVerification : SignUpReceived / Send SendVerificationEmail
  AwaitingVerification --> CheckingIdentity : EmailVerified
  AwaitingVerification --> Reminded : Reminder / Send SendReminderEmail
  AwaitingVerification --> Abandoning : Expiry / Publish SignUpAbandoned, Send CleanUpSignUp
  Reminded --> CheckingIdentity : EmailVerified
  Reminded --> Abandoning : Expiry / Publish SignUpAbandoned, Send CleanUpSignUp
  CheckingIdentity --> Activating : IdentityCheck.Completed [context.Message.Approved] / Send ActivateAccount
  CheckingIdentity --> Declined : IdentityCheck.Completed [!(context.Message.Approved)] / Publish CustomerDeclined, Send SendDeclineNotice
  CheckingIdentity --> Declined : IdentityCheck.Faulted / Publish CustomerDeclined, Send SendDeclineNotice
  CheckingIdentity --> Declined : IdentityCheck.TimeoutExpired / Publish CustomerDeclined, Send SendDeclineNotice
  Activating --> Welcoming : AccountActivated / Publish CustomerOnboarded, Send StartWelcomeSequence
  Welcoming --> Final : WelcomeSequenceCompleted
  Abandoning --> Final : CleanupCompleted
  Declined --> Final : DeclineNoticeSent
  Final --> [*]
  note right of AwaitingVerification : Schedules Reminder in 24h · Schedules Expiry in 7d
  note right of CheckingIdentity : Requests IdentityCheck (timeout 2d) · Unschedules Reminder · Unschedules Expiry
```

## States

| State | Type | Description | Activities | Requests | Timers | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |  |  |
| AwaitingVerification | Decision |  | Send SendVerificationEmail |  | Schedule Reminder in 24h<br>Schedule Expiry in 7d |  |  |  |
| Reminded | Decision |  | Send SendReminderEmail |  |  |  |  |  |
| CheckingIdentity | Decision |  |  | Request IdentityCheck (timeout 2d) | Unschedule Reminder<br>Unschedule Expiry |  |  |  |
| Activating | State |  | Send ActivateAccount |  |  |  |  |  |
| Welcoming | State |  | Publish CustomerOnboarded<br>Send StartWelcomeSequence |  |  |  |  |  |
| Abandoning | State |  | Publish SignUpAbandoned<br>Send CleanUpSignUp |  |  |  |  |  |
| Declined | State |  | Publish CustomerDeclined<br>Send SendDeclineNotice |  |  |  |  |  |
| Final | Final |  |  |  |  |  |  |  |

## Transitions

| From | Event | Guard | Source | To | Kind |
| --- | --- | --- | --- | --- | --- |
| Initial | SignUpReceived |  | external | AwaitingVerification | Forward |
| AwaitingVerification | EmailVerified |  | external | CheckingIdentity | Forward |
| AwaitingVerification | Reminder |  | timeout | Reminded | Forward |
| AwaitingVerification | Expiry |  | timeout | Abandoning | Forward |
| Reminded | EmailVerified |  | external | CheckingIdentity | Forward |
| Reminded | Expiry |  | timeout | Abandoning | Forward |
| CheckingIdentity | IdentityCheck.Completed | context.Message.Approved | reply | Activating | Forward |
| CheckingIdentity | IdentityCheck.Completed | !(context.Message.Approved) | reply | Declined | Forward |
| CheckingIdentity | IdentityCheck.Faulted |  | fault | Declined | Forward |
| CheckingIdentity | IdentityCheck.TimeoutExpired |  | timeout | Declined | Forward |
| Activating | AccountActivated |  | external | Welcoming | Forward |
| Welcoming | WelcomeSequenceCompleted |  | external | Final | Forward |
| Abandoning | CleanupCompleted |  | external | Final | Forward |
| Declined | DeclineNoticeSent |  | external | Final | Forward |

## Commands

| Command | Sent in |
| --- | --- |
| ActivateAccount | Activating |
| CleanUpSignUp | Abandoning |
| SendDeclineNotice | Declined |
| SendReminderEmail | Reminded |
| SendVerificationEmail | AwaitingVerification |
| StartWelcomeSequence | Welcoming |

## Events

| Event | Origin | Published in | Triggers |
| --- | --- | --- | --- |
| AccountActivated | External |  | Activating → Welcoming |
| CleanupCompleted | External |  | Abandoning → Final |
| CustomerDeclined | Internal | Declined |  |
| CustomerOnboarded | Internal | Welcoming |  |
| DeclineNoticeSent | External |  | Declined → Final |
| EmailVerified | External |  | AwaitingVerification → CheckingIdentity<br>Reminded → CheckingIdentity |
| Expiry | Timeout |  | AwaitingVerification → Abandoning<br>Reminded → Abandoning |
| IdentityCheck.Completed | Reply |  | CheckingIdentity → Activating<br>CheckingIdentity → Declined |
| IdentityCheck.Faulted | Fault |  | CheckingIdentity → Declined |
| IdentityCheck.TimeoutExpired | Timeout |  | CheckingIdentity → Declined |
| Reminder | Timeout |  | AwaitingVerification → Reminded |
| SignUpAbandoned | Internal | Abandoning |  |
| SignUpReceived | External |  | Initial → AwaitingVerification |
| WelcomeSequenceCompleted | External |  | Welcoming → Final |
