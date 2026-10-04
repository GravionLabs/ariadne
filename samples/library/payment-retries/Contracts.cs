namespace Acme.Payments;

// Every message carries the CorrelationId of the payment, which is how MassTransit finds the saga.

// Events from the shop, the fraud service, the reviewers, the card provider and the scheduler.
public record PaymentRequested(Guid CorrelationId, decimal Amount, string Currency);
public record FraudCheckPassed(Guid CorrelationId);
public record FraudCheckHeld(Guid CorrelationId, string Reason);
public record ReviewApproved(Guid CorrelationId);
public record ReviewRejected(Guid CorrelationId);
public record AuthorisationApproved(Guid CorrelationId);
// A failure that may pass on a second try (a network error); Attempt counts the tries so far.
public record AuthorisationFailed(Guid CorrelationId, int Attempt);
// A failure that will not (a stolen card, no funds).
public record AuthorisationDeclined(Guid CorrelationId, string Reason);
// The provider did not answer in time.
public record ProviderTimedOut(Guid CorrelationId, int Attempt);
public record RetryDue(Guid CorrelationId);
public record CaptureCompleted(Guid CorrelationId);
public record CaptureFailed(Guid CorrelationId);
public record RefundRequested(Guid CorrelationId);
public record RefundCompleted(Guid CorrelationId);
public record SettlementClosed(Guid CorrelationId);
public record MerchantNotified(Guid CorrelationId);

// Commands the saga sends.
public record CheckForFraud(Guid CorrelationId, decimal Amount, string Currency);
public record Authorise(Guid CorrelationId);
public record ScheduleRetry(Guid CorrelationId, TimeSpan Delay);
public record Capture(Guid CorrelationId);
public record IssueRefund(Guid CorrelationId);
public record NotifyMerchant(Guid CorrelationId);

// Events the saga publishes.
public record PaymentCaptured(Guid CorrelationId);
public record PaymentFailed(Guid CorrelationId);
