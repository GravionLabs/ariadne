// ODD: a file-scoped namespace, and a class that comes after another type in the file.
using MassTransit;

namespace Odd.FileScoped;

public record Unrelated(int Id);

public class FileScopedStateMachine : MassTransitStateMachine<FileScopedState>
{
    public State Working { get; private set; } = null!;
    public Event<Started> Started { get; private set; } = null!;

    public FileScopedStateMachine()
    {
        Initially(When(Started).TransitionTo(Working));
    }
}
