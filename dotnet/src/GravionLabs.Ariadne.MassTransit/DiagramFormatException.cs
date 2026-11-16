using System;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>Thrown when a document is not a valid Ariadne diagram; the message names the path in the document.</summary>
public sealed class DiagramFormatException : Exception
{
    /// <summary>Creates the exception.</summary>
    public DiagramFormatException()
    {
    }

    /// <summary>Creates the exception with a message.</summary>
    /// <param name="message">What is wrong, with the path in the document.</param>
    public DiagramFormatException(string message)
        : base(message)
    {
    }

    /// <summary>Creates the exception with a message and its cause.</summary>
    /// <param name="message">What is wrong, with the path in the document.</param>
    /// <param name="innerException">The cause.</param>
    public DiagramFormatException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
