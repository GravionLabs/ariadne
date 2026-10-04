// ODD: namespaces nested in braces, three deep, with the class in the innermost.
using MassTransit;

namespace Odd
{
    namespace Nested
    {
        namespace Deep
        {
            public class NestedStateMachine : MassTransitStateMachine<NestedState>
            {
                public State Working { get; private set; } = null!;
                public Event<Started> Started { get; private set; } = null!;

                public NestedStateMachine()
                {
                    Initially(When(Started).TransitionTo(Working));
                }
            }
        }
    }
}
