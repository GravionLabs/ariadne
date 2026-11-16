using System;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// Something in a state machine that the exporter could not read or could not show, and left out instead of guessing.
/// Warnings are returned on <see cref="SagaDiagram.Warnings"/>; reading a state machine never throws for them.
/// </summary>
public sealed class DiagramWarning
{
    /// <summary>Creates the warning.</summary>
    /// <param name="construct">The construct of the state machine, e.g. <c>Then</c>, <c>If</c> or <c>Catch</c>.</param>
    /// <param name="message">What was left out, and why.</param>
    /// <param name="state">The state it was found in, when it belongs to one.</param>
    /// <param name="event">The event it was found at, when it belongs to one.</param>
    public DiagramWarning(string construct, string message, string? state = null, string? @event = null)
    {
        Construct = construct ?? throw new ArgumentNullException(nameof(construct));
        Message = message ?? throw new ArgumentNullException(nameof(message));
        State = state;
        Event = @event;
    }

    /// <summary>The construct of the state machine, e.g. <c>Then</c>, <c>If</c> or <c>Catch</c>.</summary>
    public string Construct { get; }

    /// <summary>What was left out, and why.</summary>
    public string Message { get; }

    /// <summary>The state it was found in, when it belongs to one.</summary>
    public string? State { get; }

    /// <summary>The event it was found at, when it belongs to one.</summary>
    public string? Event { get; }

    /// <inheritdoc />
    public override string ToString()
    {
        var where = State is null ? string.Empty : Event is null ? " (" + State + ")" : " (" + State + ", " + Event + ")";
        return Construct + where + ": " + Message;
    }
}
