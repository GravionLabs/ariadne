using MassTransit;

namespace Acme.Accounts;

/// <summary>
/// Onboards a new customer: verify the e-mail address (with a reminder after a day and giving up
/// after a week), check identity with an outside provider, activate the account and send the
/// welcome sequence. A sign-up nobody finishes is cleaned up; one that fails the check is declined.
/// </summary>
public class CustomerOnboardingStateMachine : MassTransitStateMachine<CustomerOnboardingState>
{
    public CustomerOnboardingStateMachine()
    {
        InstanceState(
            x => x.CurrentState,
            AwaitingVerification, Reminded, CheckingIdentity, Activating, Welcoming, Abandoning, Declined);

        Event(() => SignUpReceived);
        Event(() => EmailVerified);
        Event(() => ReminderDue);
        Event(() => VerificationExpired);
        Event(() => KycApproved);
        Event(() => KycRejected);
        Event(() => KycTimedOut);
        Event(() => AccountActivated);
        Event(() => WelcomeSequenceCompleted);
        Event(() => CleanupCompleted);
        Event(() => DeclineNoticeSent);

        Initially(
            When(SignUpReceived)
                .Send(context => new SendVerificationEmail(context.Saga.CorrelationId, context.Message.Email))
                .TransitionTo(AwaitingVerification));

        During(AwaitingVerification,
            When(EmailVerified)
                .Send(context => new StartKycCheck(context.Saga.CorrelationId))
                .TransitionTo(CheckingIdentity),
            When(ReminderDue)
                .Send(context => new SendReminderEmail(context.Saga.CorrelationId))
                .TransitionTo(Reminded),
            When(VerificationExpired)
                .TransitionTo(Abandoning));

        During(Reminded,
            When(EmailVerified)
                .Send(context => new StartKycCheck(context.Saga.CorrelationId))
                .TransitionTo(CheckingIdentity),
            When(VerificationExpired)
                .TransitionTo(Abandoning));

        During(CheckingIdentity,
            When(KycApproved)
                .Send(context => new ActivateAccount(context.Saga.CorrelationId))
                .TransitionTo(Activating),
            When(KycRejected)
                .TransitionTo(Declined),
            When(KycTimedOut)
                .TransitionTo(Declined));

        During(Activating,
            When(AccountActivated)
                .TransitionTo(Welcoming));

        During(Welcoming,
            When(WelcomeSequenceCompleted)
                .Finalize());

        During(Abandoning,
            When(CleanupCompleted)
                .Finalize());

        During(Declined,
            When(DeclineNoticeSent)
                .Finalize());

        WhenEnter(Welcoming, binder => binder
            .Publish(context => new CustomerOnboarded(context.Saga.CorrelationId))
            .Send(context => new StartWelcomeSequence(context.Saga.CorrelationId)));

        WhenEnter(Abandoning, binder => binder
            .Publish(context => new SignUpAbandoned(context.Saga.CorrelationId))
            .Send(context => new CleanUpSignUp(context.Saga.CorrelationId)));

        WhenEnter(Declined, binder => binder
            .Publish(context => new CustomerDeclined(context.Saga.CorrelationId))
            .Send(context => new SendDeclineNotice(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State AwaitingVerification { get; private set; } = null!;
    public State Reminded { get; private set; } = null!;
    public State CheckingIdentity { get; private set; } = null!;
    public State Activating { get; private set; } = null!;
    public State Welcoming { get; private set; } = null!;
    public State Abandoning { get; private set; } = null!;
    public State Declined { get; private set; } = null!;

    public Event<SignUpReceived> SignUpReceived { get; private set; } = null!;
    public Event<EmailVerified> EmailVerified { get; private set; } = null!;
    public Event<ReminderDue> ReminderDue { get; private set; } = null!;
    public Event<VerificationExpired> VerificationExpired { get; private set; } = null!;
    public Event<KycApproved> KycApproved { get; private set; } = null!;
    public Event<KycRejected> KycRejected { get; private set; } = null!;
    public Event<KycTimedOut> KycTimedOut { get; private set; } = null!;
    public Event<AccountActivated> AccountActivated { get; private set; } = null!;
    public Event<WelcomeSequenceCompleted> WelcomeSequenceCompleted { get; private set; } = null!;
    public Event<CleanupCompleted> CleanupCompleted { get; private set; } = null!;
    public Event<DeclineNoticeSent> DeclineNoticeSent { get; private set; } = null!;
}
