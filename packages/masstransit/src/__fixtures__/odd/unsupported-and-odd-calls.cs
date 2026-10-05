// ODD: constructs that are valid but not drawn (Switch, WhenLeave), among others that are.
using MassTransit;

namespace Odd;

public class UnsupportedStateMachine : MassTransitStateMachine<UnsupportedState>
{
    public State Working { get; private set; } = null!;
    public State Waiting { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;
    public Event<Stopped> Stopped { get; private set; } = null!;
    public Schedule<UnsupportedState, Timeout> Timeout { get; private set; } = null!;
    public Request<UnsupportedState, Ask, Answer> Ask { get; private set; } = null!;

    public UnsupportedStateMachine()
    {
        Initially(
            When(Started)
                .If(context => context.Message.Big, x => x.TransitionTo(Working))
                .Schedule(Timeout, context => new Timeout())
                .Request(Ask, context => new Ask())
                .TransitionTo(Waiting));
        During(Waiting,
            When(Stopped).Switch(x => x.If(c => true, y => y.Finalize())));
        WhenLeave(Waiting, x => x.Then(c => { }));
    }
}
