using MassTransit;

namespace Acme.Payments;

/// <summary>
/// Takes a card payment: a fraud check (which can hold the payment for a person to review), then
/// authorisation and capture. A failure that may pass is retried, up to three tries, each after a
/// wait; a captured payment can be refunded until it settles.
/// </summary>
public class PaymentRetriesStateMachine : MassTransitStateMachine<PaymentRetriesState>
{
    private const int MaxTries = 3;

    public PaymentRetriesStateMachine()
    {
        InstanceState(
            x => x.CurrentState,
            CheckingFraud, InReview, Authorising, WaitingToRetry, Capturing, Captured, Refunding, Failed);

        Event(() => PaymentRequested);
        Event(() => FraudCheckPassed);
        Event(() => FraudCheckHeld);
        Event(() => ReviewApproved);
        Event(() => ReviewRejected);
        Event(() => AuthorisationApproved);
        Event(() => AuthorisationFailed);
        Event(() => AuthorisationDeclined);
        Event(() => ProviderTimedOut);
        Event(() => RetryDue);
        Event(() => CaptureCompleted);
        Event(() => CaptureFailed);
        Event(() => RefundRequested);
        Event(() => RefundCompleted);
        Event(() => SettlementClosed);
        Event(() => MerchantNotified);

        Initially(
            When(PaymentRequested)
                .Send(context => new CheckForFraud(context.Saga.CorrelationId, context.Message.Amount, context.Message.Currency))
                .TransitionTo(CheckingFraud));

        During(CheckingFraud,
            // The shop may send the request twice.
            Ignore(PaymentRequested),
            When(FraudCheckPassed)
                .Send(context => new Authorise(context.Saga.CorrelationId))
                .TransitionTo(Authorising),
            When(FraudCheckHeld)
                .TransitionTo(InReview));

        During(InReview,
            When(ReviewApproved)
                .Send(context => new Authorise(context.Saga.CorrelationId))
                .TransitionTo(Authorising),
            When(ReviewRejected)
                .TransitionTo(Failed));

        During(Authorising,
            Ignore(PaymentRequested),
            When(AuthorisationApproved)
                .Send(context => new Capture(context.Saga.CorrelationId))
                .TransitionTo(Capturing),
            When(AuthorisationDeclined)
                .TransitionTo(Failed),
            // The same event leads to two states, by how many tries have been made.
            When(AuthorisationFailed, context => context.Message.Attempt < MaxTries)
                .Send(context => new ScheduleRetry(context.Saga.CorrelationId, TimeSpan.FromMinutes(5)))
                .TransitionTo(WaitingToRetry),
            When(AuthorisationFailed, context => context.Message.Attempt >= MaxTries)
                .TransitionTo(Failed),
            // The provider's answer did not come: the same rule.
            When(ProviderTimedOut, context => context.Message.Attempt < MaxTries)
                .Send(context => new ScheduleRetry(context.Saga.CorrelationId, TimeSpan.FromMinutes(5)))
                .TransitionTo(WaitingToRetry),
            When(ProviderTimedOut, context => context.Message.Attempt >= MaxTries)
                .TransitionTo(Failed));

        During(WaitingToRetry,
            When(RetryDue)
                .Send(context => new Authorise(context.Saga.CorrelationId))
                .TransitionTo(Authorising));

        During(Capturing,
            When(CaptureCompleted)
                .TransitionTo(Captured),
            When(CaptureFailed)
                .TransitionTo(Failed));

        During(Captured,
            When(RefundRequested)
                .Send(context => new IssueRefund(context.Saga.CorrelationId))
                .TransitionTo(Refunding),
            When(SettlementClosed)
                .Finalize());

        During(Refunding,
            When(RefundCompleted)
                .Finalize());

        During(Failed,
            When(MerchantNotified)
                .Finalize());

        WhenEnter(Captured, binder => binder
            .Publish(context => new PaymentCaptured(context.Saga.CorrelationId)));

        WhenEnter(Failed, binder => binder
            .Publish(context => new PaymentFailed(context.Saga.CorrelationId))
            .Send(context => new NotifyMerchant(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State CheckingFraud { get; private set; } = null!;
    public State InReview { get; private set; } = null!;
    public State Authorising { get; private set; } = null!;
    public State WaitingToRetry { get; private set; } = null!;
    public State Capturing { get; private set; } = null!;
    public State Captured { get; private set; } = null!;
    public State Refunding { get; private set; } = null!;
    public State Failed { get; private set; } = null!;

    public Event<PaymentRequested> PaymentRequested { get; private set; } = null!;
    public Event<FraudCheckPassed> FraudCheckPassed { get; private set; } = null!;
    public Event<FraudCheckHeld> FraudCheckHeld { get; private set; } = null!;
    public Event<ReviewApproved> ReviewApproved { get; private set; } = null!;
    public Event<ReviewRejected> ReviewRejected { get; private set; } = null!;
    public Event<AuthorisationApproved> AuthorisationApproved { get; private set; } = null!;
    public Event<AuthorisationFailed> AuthorisationFailed { get; private set; } = null!;
    public Event<AuthorisationDeclined> AuthorisationDeclined { get; private set; } = null!;
    public Event<ProviderTimedOut> ProviderTimedOut { get; private set; } = null!;
    public Event<RetryDue> RetryDue { get; private set; } = null!;
    public Event<CaptureCompleted> CaptureCompleted { get; private set; } = null!;
    public Event<CaptureFailed> CaptureFailed { get; private set; } = null!;
    public Event<RefundRequested> RefundRequested { get; private set; } = null!;
    public Event<RefundCompleted> RefundCompleted { get; private set; } = null!;
    public Event<SettlementClosed> SettlementClosed { get; private set; } = null!;
    public Event<MerchantNotified> MerchantNotified { get; private set; } = null!;
}
