# Loan Application

## Diagram

```mermaid
---
title: "Loan Application"
---
stateDiagram-v2
  accTitle: Loan Application
  accDescr: 9 states and 18 transitions, from Initial to Final.
  direction TB
  state ChecksCompleted <<join>>
  [*] --> AwaitingChecks : ApplicationSubmitted / Send RunCreditCheck, Send VerifyIdentity, Send VerifyIncome
  AwaitingChecks --> ChecksCompleted : CreditCheckCompleted
  AwaitingChecks --> ChecksCompleted : IdentityVerified
  AwaitingChecks --> ChecksCompleted : IncomeVerified
  ChecksCompleted --> Scoring : ChecksCompleted / Send ScoreApplication
  AwaitingChecks --> Withdrawn : CreditCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
  AwaitingChecks --> Withdrawn : IdentityCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
  AwaitingChecks --> Withdrawn : IncomeCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
  Scoring --> OfferMade : ScoringCompleted [context.Message.Outcome == #quot;Approved#quot;] / Send PrepareOffer
  Scoring --> InManualReview : ScoringCompleted [context.Message.Outcome == #quot;Referred#quot;] / Send AssignReviewer
  Scoring --> Declined : ScoringCompleted [context.Message.Outcome == #quot;Declined#quot;] / Publish ApplicationDeclined, Send NotifyApplicant
  InManualReview --> OfferMade : ReviewCompleted [context.Message.Approved] / Send PrepareOffer
  InManualReview --> Declined : ReviewCompleted [!(context.Message.Approved)] / Publish ApplicationDeclined, Send NotifyApplicant
  OfferMade --> Disbursing : OfferAccepted / Send DisburseFunds
  OfferMade --> Withdrawn : OfferExpired / Publish ApplicationWithdrawn, Send NotifyApplicant
  Disbursing --> Final : FundsDisbursed
  Declined --> Final : ApplicantNotified
  Withdrawn --> Final : ApplicantNotified
  Final --> [*]
  note right of ChecksCompleted : ChecksCompleted when CreditCheckCompleted + IdentityVerified + IncomeVerified have all arrived
```

## States

| State | Type | Description | Activities | Waits for | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |  |
| AwaitingChecks | Decision |  | Send RunCreditCheck<br>Send VerifyIdentity<br>Send VerifyIncome |  |  |  |  |
| Scoring | Decision |  | Send ScoreApplication |  |  |  |  |
| InManualReview | Decision |  | Send AssignReviewer |  |  |  |  |
| OfferMade | Decision |  | Send PrepareOffer |  |  |  |  |
| Disbursing | State |  | Send DisburseFunds |  |  |  |  |
| Declined | State |  | Publish ApplicationDeclined<br>Send NotifyApplicant |  |  |  |  |
| Withdrawn | State |  | Publish ApplicationWithdrawn<br>Send NotifyApplicant |  |  |  |  |
| Final | Final |  |  |  |  |  |  |
| ChecksCompleted | Join |  |  | CreditCheckCompleted<br>IdentityVerified<br>IncomeVerified |  |  |  |

## Transitions

| From | Event | Guard | Source | To | Kind |
| --- | --- | --- | --- | --- | --- |
| Initial | ApplicationSubmitted |  | external | AwaitingChecks | Forward |
| AwaitingChecks | CreditCheckCompleted |  | external | ChecksCompleted | Forward |
| AwaitingChecks | IdentityVerified |  | external | ChecksCompleted | Forward |
| AwaitingChecks | IncomeVerified |  | external | ChecksCompleted | Forward |
| ChecksCompleted | ChecksCompleted |  | join | Scoring | Forward |
| AwaitingChecks | CreditCheckTimedOut |  | external | Withdrawn | Forward |
| AwaitingChecks | IdentityCheckTimedOut |  | external | Withdrawn | Forward |
| AwaitingChecks | IncomeCheckTimedOut |  | external | Withdrawn | Forward |
| Scoring | ScoringCompleted | context.Message.Outcome == "Approved" | external | OfferMade | Forward |
| Scoring | ScoringCompleted | context.Message.Outcome == "Referred" | external | InManualReview | Forward |
| Scoring | ScoringCompleted | context.Message.Outcome == "Declined" | external | Declined | Forward |
| InManualReview | ReviewCompleted | context.Message.Approved | external | OfferMade | Forward |
| InManualReview | ReviewCompleted | !(context.Message.Approved) | external | Declined | Forward |
| OfferMade | OfferAccepted |  | external | Disbursing | Forward |
| OfferMade | OfferExpired |  | external | Withdrawn | Forward |
| Disbursing | FundsDisbursed |  | external | Final | Forward |
| Declined | ApplicantNotified |  | external | Final | Forward |
| Withdrawn | ApplicantNotified |  | external | Final | Forward |

## Commands

| Command | Sent in |
| --- | --- |
| AssignReviewer | InManualReview |
| DisburseFunds | Disbursing |
| NotifyApplicant | Declined, Withdrawn |
| PrepareOffer | OfferMade |
| RunCreditCheck | AwaitingChecks |
| ScoreApplication | Scoring |
| VerifyIdentity | AwaitingChecks |
| VerifyIncome | AwaitingChecks |

## Events

| Event | Origin | Published in | Triggers |
| --- | --- | --- | --- |
| ApplicantNotified | External |  | Declined → Final<br>Withdrawn → Final |
| ApplicationDeclined | Internal | Declined |  |
| ApplicationSubmitted | External |  | Initial → AwaitingChecks |
| ApplicationWithdrawn | Internal | Withdrawn |  |
| ChecksCompleted | Composite |  | ChecksCompleted → Scoring |
| CreditCheckCompleted | External |  | AwaitingChecks → ChecksCompleted |
| CreditCheckTimedOut | External |  | AwaitingChecks → Withdrawn |
| FundsDisbursed | External |  | Disbursing → Final |
| IdentityCheckTimedOut | External |  | AwaitingChecks → Withdrawn |
| IdentityVerified | External |  | AwaitingChecks → ChecksCompleted |
| IncomeCheckTimedOut | External |  | AwaitingChecks → Withdrawn |
| IncomeVerified | External |  | AwaitingChecks → ChecksCompleted |
| OfferAccepted | External |  | OfferMade → Disbursing |
| OfferExpired | External |  | OfferMade → Withdrawn |
| ReviewCompleted | External |  | InManualReview → OfferMade<br>InManualReview → Declined |
| ScoringCompleted | External |  | Scoring → OfferMade<br>Scoring → InManualReview<br>Scoring → Declined |
