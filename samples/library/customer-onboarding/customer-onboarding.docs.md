# Customer Onboarding

## Diagram

```mermaid
---
title: "Customer Onboarding"
---
stateDiagram-v2
  accTitle: Customer Onboarding
  accDescr: 9 states and 13 transitions, from Initial to Final.
  direction TB
  [*] --> AwaitingVerification : SignUpReceived / Send SendVerificationEmail
  AwaitingVerification --> CheckingIdentity : EmailVerified / Send StartKycCheck
  AwaitingVerification --> Reminded : ReminderDue / Send SendReminderEmail
  AwaitingVerification --> Abandoning : VerificationExpired / Publish SignUpAbandoned, Send CleanUpSignUp
  Reminded --> CheckingIdentity : EmailVerified / Send StartKycCheck
  Reminded --> Abandoning : VerificationExpired / Publish SignUpAbandoned, Send CleanUpSignUp
  CheckingIdentity --> Activating : KycApproved / Send ActivateAccount
  CheckingIdentity --> Declined : KycRejected / Publish CustomerDeclined, Send SendDeclineNotice
  CheckingIdentity --> Declined : KycTimedOut / Publish CustomerDeclined, Send SendDeclineNotice
  Activating --> Welcoming : AccountActivated / Publish CustomerOnboarded, Send StartWelcomeSequence
  Welcoming --> Final : WelcomeSequenceCompleted
  Abandoning --> Final : CleanupCompleted
  Declined --> Final : DeclineNoticeSent
  Final --> [*]
```

## States

| State | Type | Description | Activities | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |
| AwaitingVerification | Decision |  | Send SendVerificationEmail |  |  |  |
| Reminded | Decision |  | Send SendReminderEmail |  |  |  |
| CheckingIdentity | Decision |  | Send StartKycCheck |  |  |  |
| Activating | State |  | Send ActivateAccount |  |  |  |
| Welcoming | State |  | Publish CustomerOnboarded<br>Send StartWelcomeSequence |  |  |  |
| Abandoning | State |  | Publish SignUpAbandoned<br>Send CleanUpSignUp |  |  |  |
| Declined | State |  | Publish CustomerDeclined<br>Send SendDeclineNotice |  |  |  |
| Final | Final |  |  |  |  |  |

## Transitions

| From | Event | Source | To | Kind |
| --- | --- | --- | --- | --- |
| Initial | SignUpReceived | external | AwaitingVerification | Forward |
| AwaitingVerification | EmailVerified | external | CheckingIdentity | Forward |
| AwaitingVerification | ReminderDue | external | Reminded | Forward |
| AwaitingVerification | VerificationExpired | external | Abandoning | Forward |
| Reminded | EmailVerified | external | CheckingIdentity | Forward |
| Reminded | VerificationExpired | external | Abandoning | Forward |
| CheckingIdentity | KycApproved | external | Activating | Forward |
| CheckingIdentity | KycRejected | external | Declined | Forward |
| CheckingIdentity | KycTimedOut | external | Declined | Forward |
| Activating | AccountActivated | external | Welcoming | Forward |
| Welcoming | WelcomeSequenceCompleted | external | Final | Forward |
| Abandoning | CleanupCompleted | external | Final | Forward |
| Declined | DeclineNoticeSent | external | Final | Forward |

## Commands

| Command | Sent in |
| --- | --- |
| ActivateAccount | Activating |
| CleanUpSignUp | Abandoning |
| SendDeclineNotice | Declined |
| SendReminderEmail | Reminded |
| SendVerificationEmail | AwaitingVerification |
| StartKycCheck | CheckingIdentity |
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
| KycApproved | External |  | CheckingIdentity → Activating |
| KycRejected | External |  | CheckingIdentity → Declined |
| KycTimedOut | External |  | CheckingIdentity → Declined |
| ReminderDue | External |  | AwaitingVerification → Reminded |
| SignUpAbandoned | Internal | Abandoning |  |
| SignUpReceived | External |  | Initial → AwaitingVerification |
| VerificationExpired | External |  | AwaitingVerification → Abandoning<br>Reminded → Abandoning |
| WelcomeSequenceCompleted | External |  | Welcoming → Final |
