using MassTransit;

namespace Acme.Lending;

/// <summary>
/// Handles a loan application: a credit check, an identity check and an income check, each with its
/// own time limit, then a decision. The scoring service approves, declines or refers the case to a
/// person; an offer that is approved lapses if the applicant does not accept it in time.
/// </summary>
public class LoanApplicationStateMachine : MassTransitStateMachine<LoanApplicationState>
{
    public LoanApplicationStateMachine()
    {
        InstanceState(
            x => x.CurrentState,
            AwaitingCreditCheck, AwaitingIdentityCheck, AwaitingIncomeCheck, Scoring,
            InManualReview, OfferMade, Disbursing, Declined, Withdrawn);

        Event(() => ApplicationSubmitted);
        Event(() => CreditCheckCompleted);
        Event(() => IdentityVerified);
        Event(() => IncomeVerified);
        Event(() => CreditCheckTimedOut);
        Event(() => IdentityCheckTimedOut);
        Event(() => IncomeCheckTimedOut);
        Event(() => ScoringCompleted);
        Event(() => ReviewCompleted);
        Event(() => OfferAccepted);
        Event(() => OfferExpired);
        Event(() => FundsDisbursed);
        Event(() => ApplicantNotified);

        Initially(
            When(ApplicationSubmitted)
                .Send(context => new RunCreditCheck(context.Saga.CorrelationId, context.Message.Applicant))
                .TransitionTo(AwaitingCreditCheck));

        During(AwaitingCreditCheck,
            When(CreditCheckCompleted)
                .Send(context => new VerifyIdentity(context.Saga.CorrelationId))
                .TransitionTo(AwaitingIdentityCheck),
            When(CreditCheckTimedOut)
                .TransitionTo(Withdrawn));

        During(AwaitingIdentityCheck,
            When(IdentityVerified)
                .Send(context => new VerifyIncome(context.Saga.CorrelationId))
                .TransitionTo(AwaitingIncomeCheck),
            When(IdentityCheckTimedOut)
                .TransitionTo(Withdrawn));

        During(AwaitingIncomeCheck,
            When(IncomeVerified)
                .Send(context => new ScoreApplication(context.Saga.CorrelationId))
                .TransitionTo(Scoring),
            When(IncomeCheckTimedOut)
                .TransitionTo(Withdrawn));

        // One event, three ways on, by the outcome the scoring service reports.
        During(Scoring,
            When(ScoringCompleted, context => context.Message.Outcome == "Approved")
                .Send(context => new PrepareOffer(context.Saga.CorrelationId))
                .TransitionTo(OfferMade),
            When(ScoringCompleted, context => context.Message.Outcome == "Referred")
                .Send(context => new AssignReviewer(context.Saga.CorrelationId))
                .TransitionTo(InManualReview),
            When(ScoringCompleted, context => context.Message.Outcome == "Declined")
                .TransitionTo(Declined));

        During(InManualReview,
            When(ReviewCompleted, context => context.Message.Approved)
                .Send(context => new PrepareOffer(context.Saga.CorrelationId))
                .TransitionTo(OfferMade),
            When(ReviewCompleted, context => !context.Message.Approved)
                .TransitionTo(Declined));

        During(OfferMade,
            When(OfferAccepted)
                .Send(context => new DisburseFunds(context.Saga.CorrelationId))
                .TransitionTo(Disbursing),
            When(OfferExpired)
                .TransitionTo(Withdrawn));

        During(Disbursing,
            When(FundsDisbursed)
                .Finalize());

        During(Declined,
            When(ApplicantNotified)
                .Finalize());

        During(Withdrawn,
            When(ApplicantNotified)
                .Finalize());

        WhenEnter(Declined, binder => binder
            .Publish(context => new ApplicationDeclined(context.Saga.CorrelationId))
            .Send(context => new NotifyApplicant(context.Saga.CorrelationId)));

        WhenEnter(Withdrawn, binder => binder
            .Publish(context => new ApplicationWithdrawn(context.Saga.CorrelationId))
            .Send(context => new NotifyApplicant(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State AwaitingCreditCheck { get; private set; } = null!;
    public State AwaitingIdentityCheck { get; private set; } = null!;
    public State AwaitingIncomeCheck { get; private set; } = null!;
    public State Scoring { get; private set; } = null!;
    public State InManualReview { get; private set; } = null!;
    public State OfferMade { get; private set; } = null!;
    public State Disbursing { get; private set; } = null!;
    public State Declined { get; private set; } = null!;
    public State Withdrawn { get; private set; } = null!;

    public Event<ApplicationSubmitted> ApplicationSubmitted { get; private set; } = null!;
    public Event<CreditCheckCompleted> CreditCheckCompleted { get; private set; } = null!;
    public Event<IdentityVerified> IdentityVerified { get; private set; } = null!;
    public Event<IncomeVerified> IncomeVerified { get; private set; } = null!;
    public Event<CreditCheckTimedOut> CreditCheckTimedOut { get; private set; } = null!;
    public Event<IdentityCheckTimedOut> IdentityCheckTimedOut { get; private set; } = null!;
    public Event<IncomeCheckTimedOut> IncomeCheckTimedOut { get; private set; } = null!;
    public Event<ScoringCompleted> ScoringCompleted { get; private set; } = null!;
    public Event<ReviewCompleted> ReviewCompleted { get; private set; } = null!;
    public Event<OfferAccepted> OfferAccepted { get; private set; } = null!;
    public Event<OfferExpired> OfferExpired { get; private set; } = null!;
    public Event<FundsDisbursed> FundsDisbursed { get; private set; } = null!;
    public Event<ApplicantNotified> ApplicantNotified { get; private set; } = null!;
}
