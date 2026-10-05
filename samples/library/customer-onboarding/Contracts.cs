namespace Acme.Accounts;

// Every message carries the CorrelationId of the sign-up, which is how MassTransit finds the saga.

// Events from the web site, the identity provider, the account service and the scheduler.
public record SignUpReceived(Guid CorrelationId, string Email);
public record EmailVerified(Guid CorrelationId);
// The scheduler sends these 24 hours and 7 days after the sign-up.
public record ReminderDue(Guid CorrelationId);
public record VerificationExpired(Guid CorrelationId);
public record KycApproved(Guid CorrelationId);
public record KycRejected(Guid CorrelationId, string Reason);
// The identity provider did not answer within two days.
public record KycTimedOut(Guid CorrelationId);
public record AccountActivated(Guid CorrelationId);
public record WelcomeSequenceCompleted(Guid CorrelationId);
public record CleanupCompleted(Guid CorrelationId);
public record DeclineNoticeSent(Guid CorrelationId);

// Commands the saga sends.
public record SendVerificationEmail(Guid CorrelationId, string Email);
public record SendReminderEmail(Guid CorrelationId);
public record StartKycCheck(Guid CorrelationId);
public record ActivateAccount(Guid CorrelationId);
public record StartWelcomeSequence(Guid CorrelationId);
public record CleanUpSignUp(Guid CorrelationId);
public record SendDeclineNotice(Guid CorrelationId);

// Events the saga publishes.
public record CustomerOnboarded(Guid CorrelationId);
public record SignUpAbandoned(Guid CorrelationId);
public record CustomerDeclined(Guid CorrelationId);
