// ODD: a generic helper method, expression-bodied members, and a static local function.
using MassTransit;

namespace Odd;

public class ExpressionStateMachine : MassTransitStateMachine<ExpressionState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;
    public Event<Stopped> Stopped { get; private set; } = null!;

    public ExpressionStateMachine() => Configure();

    private void Configure()
    {
        Initially(When(Started).TransitionTo(Working));
        During(Working, When(Stopped).Then(Log<Stopped>).Finalize());
        static void Local() { }
    }

    private static void Log<T>(BehaviorContext<ExpressionState, T> context) where T : class => System.Console.WriteLine(context);
    public string Describe() => "x";
}
