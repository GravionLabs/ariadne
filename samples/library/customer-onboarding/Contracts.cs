namespace Acme.Accounts;

// Every message carries the CorrelationId of the sign-up, which is how MassTransit finds the saga.

// Events from the web site, the identity provider, the account service and the scheduler.
public record SignUpReceived(Guid CorrelationId, string Email);
public record EmailVerified(Guid CorrelationId);
// The scheduler sends these 24 hours and 7 days after the sign-up.
public record ReminderDue(Guid CorrelationId);
public record VerificationExpired(Guid CorrelationId);
public record AccountActivated(Guid CorrelationId);
public record WelcomeSequenceCompleted(Guid CorrelationId);
public record CleanupCompleted(Guid CorrelationId);
public record DeclineNoticeSent(Guid CorrelationId);

// The identity provider's answer to StartKycCheck, which the saga sends as a request.
public record KycResult(Guid CorrelationId, bool Approved, string? Reason);

// Commands the saga sends.
public record SendVerificationEmail(Guid CorrelationId, string Email);
public record SendReminderEmail(Guid CorrelationId);
// A request: it waits for KycResult, a failure, or two days of silence.
public record StartKycCheck(Guid CorrelationId);
public record ActivateAccount(Guid CorrelationId);
public record StartWelcomeSequence(Guid CorrelationId);
public record CleanUpSignUp(Guid CorrelationId);
public record SendDeclineNotice(Guid CorrelationId);

// Events the saga publishes.
public record CustomerOnboarded(Guid CorrelationId);
public record SignUpAbandoned(Guid CorrelationId);
public record CustomerDeclined(Guid CorrelationId);
