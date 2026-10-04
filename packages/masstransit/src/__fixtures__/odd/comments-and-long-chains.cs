// ODD: comments between During( and When(, and a fluent chain split over many lines.
using MassTransit;

namespace Odd;

public class ChainStateMachine : MassTransitStateMachine<ChainState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;
    public Event<Stopped> Stopped { get; private set; } = null!;

    public ChainStateMachine()
    {
        Initially(
            // first, wait for the start
            /* block comment */ When(Started)
                .Then(x => { })

                .Then(x => { })   // trailing comment
                .Then(x => { })
                .Then(x => { })
                .Then(x => { })
                .TransitionTo(Working));

        During(
            Working, // the state
            /* and */
            When(Stopped)
                .Finalize());
    }
}
