# Loan Application

## Diagram

```mermaid
---
title: "Loan Application"
---
stateDiagram-v2
  accTitle: Loan Application
  accDescr: 11 states and 17 transitions, from Initial to Final.
  direction TB
  [*] --> AwaitingCreditCheck : ApplicationSubmitted / Send RunCreditCheck
  AwaitingCreditCheck --> AwaitingIdentityCheck : CreditCheckCompleted / Send VerifyIdentity
  AwaitingCreditCheck --> Withdrawn : CreditCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
  AwaitingIdentityCheck --> AwaitingIncomeCheck : IdentityVerified / Send VerifyIncome
  AwaitingIdentityCheck --> Withdrawn : IdentityCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
  AwaitingIncomeCheck --> Scoring : IncomeVerified / Send ScoreApplication
  AwaitingIncomeCheck --> Withdrawn : IncomeCheckTimedOut / Publish ApplicationWithdrawn, Send NotifyApplicant
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
```

## States

| State | Type | Description | Activities | Compensation | Retry | Timeout |
| --- | --- | --- | --- | --- | --- | --- |
| Initial | Initial |  |  |  |  |  |
| AwaitingCreditCheck | Decision |  | Send RunCreditCheck |  |  |  |
| AwaitingIdentityCheck | Decision |  | Send VerifyIdentity |  |  |  |
| AwaitingIncomeCheck | Decision |  | Send VerifyIncome |  |  |  |
| Scoring | Decision |  | Send ScoreApplication |  |  |  |
| InManualReview | Decision |  | Send AssignReviewer |  |  |  |
| OfferMade | Decision |  | Send PrepareOffer |  |  |  |
| Disbursing | State |  | Send DisburseFunds |  |  |  |
| Declined | State |  | Publish ApplicationDeclined<br>Send NotifyApplicant |  |  |  |
| Withdrawn | State |  | Publish ApplicationWithdrawn<br>Send NotifyApplicant |  |  |  |
| Final | Final |  |  |  |  |  |

## Transitions

| From | Event | Guard | Source | To | Kind |
| --- | --- | --- | --- | --- | --- |
| Initial | ApplicationSubmitted |  | external | AwaitingCreditCheck | Forward |
| AwaitingCreditCheck | CreditCheckCompleted |  | external | AwaitingIdentityCheck | Forward |
| AwaitingCreditCheck | CreditCheckTimedOut |  | external | Withdrawn | Forward |
| AwaitingIdentityCheck | IdentityVerified |  | external | AwaitingIncomeCheck | Forward |
| AwaitingIdentityCheck | IdentityCheckTimedOut |  | external | Withdrawn | Forward |
| AwaitingIncomeCheck | IncomeVerified |  | external | Scoring | Forward |
| AwaitingIncomeCheck | IncomeCheckTimedOut |  | external | Withdrawn | Forward |
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
| RunCreditCheck | AwaitingCreditCheck |
| ScoreApplication | Scoring |
| VerifyIdentity | AwaitingIdentityCheck |
| VerifyIncome | AwaitingIncomeCheck |

## Events

| Event | Origin | Published in | Triggers |
| --- | --- | --- | --- |
| ApplicantNotified | External |  | Declined → Final<br>Withdrawn → Final |
| ApplicationDeclined | Internal | Declined |  |
| ApplicationSubmitted | External |  | Initial → AwaitingCreditCheck |
| ApplicationWithdrawn | Internal | Withdrawn |  |
| CreditCheckCompleted | External |  | AwaitingCreditCheck → AwaitingIdentityCheck |
| CreditCheckTimedOut | External |  | AwaitingCreditCheck → Withdrawn |
| FundsDisbursed | External |  | Disbursing → Final |
| IdentityCheckTimedOut | External |  | AwaitingIdentityCheck → Withdrawn |
| IdentityVerified | External |  | AwaitingIdentityCheck → AwaitingIncomeCheck |
| IncomeCheckTimedOut | External |  | AwaitingIncomeCheck → Withdrawn |
| IncomeVerified | External |  | AwaitingIncomeCheck → Scoring |
| OfferAccepted | External |  | OfferMade → Disbursing |
| OfferExpired | External |  | OfferMade → Withdrawn |
| ReviewCompleted | External |  | InManualReview → OfferMade<br>InManualReview → Declined |
| ScoringCompleted | External |  | Scoring → OfferMade<br>Scoring → InManualReview<br>Scoring → Declined |
