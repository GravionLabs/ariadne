// ODD: attributes, #if/#endif and #region in odd places, including inside the fluent chain.
using MassTransit;

namespace Odd;

[System.Serializable]
public class DirectiveStateMachine : MassTransitStateMachine<DirectiveState>
{
    #region States
    [System.Obsolete] public State Working { get; private set; } = null!;
    #endregion

    public Event<Started> Started { get; private set; } = null!;
    public Event<Stopped> Stopped { get; private set; } = null!;

    public DirectiveStateMachine()
    {
        Initially(
            When(Started)
#if DEBUG
                .Then(x => { })
#endif
                .TransitionTo(Working));
        #region Ending
        During(Working,
            When(Stopped).Finalize());
        #endregion
    }
}
