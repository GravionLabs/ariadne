namespace Acme.Lending;

// Every message carries the CorrelationId of the application, which is how MassTransit finds the saga.

// Events from the applicant's app, the checking services, the reviewers and the scheduler.
public record ApplicationSubmitted(Guid CorrelationId, string Applicant, decimal Amount);
public record CreditCheckCompleted(Guid CorrelationId, int Score);
public record IdentityVerified(Guid CorrelationId);
public record IncomeVerified(Guid CorrelationId);
// Each check has its own time limit; the scheduler sends these when it runs out.
public record CreditCheckTimedOut(Guid CorrelationId);
public record IdentityCheckTimedOut(Guid CorrelationId);
public record IncomeCheckTimedOut(Guid CorrelationId);
// The scoring service decides "Approved", "Referred" or "Declined".
public record ScoringCompleted(Guid CorrelationId, string Outcome);
public record ReviewCompleted(Guid CorrelationId, bool Approved);
public record OfferAccepted(Guid CorrelationId);
public record OfferExpired(Guid CorrelationId);
public record FundsDisbursed(Guid CorrelationId);
public record ApplicantNotified(Guid CorrelationId);

// Commands the saga sends.
public record RunCreditCheck(Guid CorrelationId, string Applicant);
public record VerifyIdentity(Guid CorrelationId);
public record VerifyIncome(Guid CorrelationId);
public record ScoreApplication(Guid CorrelationId);
public record AssignReviewer(Guid CorrelationId);
public record PrepareOffer(Guid CorrelationId);
public record DisburseFunds(Guid CorrelationId);
public record NotifyApplicant(Guid CorrelationId);

// Events the saga publishes.
public record ApplicationDeclined(Guid CorrelationId);
public record ApplicationWithdrawn(Guid CorrelationId);
