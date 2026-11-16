using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// A saga state machine as an Ariadne diagram, format version 3 (docs/specs/diagram-format.md). The types are
/// immutable. <see cref="ToJson"/> writes what <c>@ariadne/core</c> writes for the same diagram, byte for byte.
/// </summary>
[JsonConverter(typeof(SagaDiagramJsonConverter))]
public sealed class SagaDiagram
{
    /// <summary>Creates the diagram.</summary>
    /// <param name="nodes">The states.</param>
    /// <param name="edges">The transitions.</param>
    /// <param name="name">Title of the saga.</param>
    /// <param name="description">What the saga does.</param>
    /// <param name="saga">What generating or importing C# needs to know about the saga.</param>
    /// <param name="events">What is known in code about the events.</param>
    /// <param name="direction">Which way the flow runs.</param>
    /// <param name="spacing">Room between states and layers; <see langword="null"/> and <see cref="Spacing.Normal"/> are the same and not written.</param>
    public SagaDiagram(
        IEnumerable<DiagramNode>? nodes = null,
        IEnumerable<DiagramEdge>? edges = null,
        string? name = null,
        string? description = null,
        SagaInfo? saga = null,
        IEnumerable<EventInfo>? events = null,
        Direction direction = Direction.TopBottom,
        Spacing? spacing = null)
    {
        Nodes = Lists.Copy(nodes);
        Edges = Lists.Copy(edges);
        Name = name;
        Description = description;
        Saga = saga;
        Events = Lists.Copy(events);
        Direction = direction;
        Spacing = spacing;
    }

    /// <summary>Title of the saga.</summary>
    public string? Name { get; }

    /// <summary>What the saga does.</summary>
    public string? Description { get; }

    /// <summary>What generating or importing C# needs to know about the saga.</summary>
    public SagaInfo? Saga { get; }

    /// <summary>What is known in code about the events.</summary>
    public IReadOnlyList<EventInfo> Events { get; }

    /// <summary>Which way the flow runs; <see cref="Direction.TopBottom"/> when the document does not say.</summary>
    public Direction Direction { get; }

    /// <summary>Room between states and layers; <see langword="null"/> is normal.</summary>
    public Spacing? Spacing { get; }

    /// <summary>The states.</summary>
    public IReadOnlyList<DiagramNode> Nodes { get; }

    /// <summary>The transitions.</summary>
    public IReadOnlyList<DiagramEdge> Edges { get; }

    /// <summary>
    /// The diagram as JSON in the form of the format specification: its key order, two spaces, a trailing newline and
    /// LF line ends on every platform. Unset optional fields are left out.
    /// </summary>
    /// <returns>The JSON text.</returns>
    public string ToJson() => DiagramJsonWriter.Write(this, indented: true) + "\n";

    /// <summary>The diagram as JSON without indentation or a trailing newline, for HTTP responses. Same keys, same order, same escaping.</summary>
    /// <returns>The JSON text.</returns>
    public string ToCompactJson() => DiagramJsonWriter.Write(this, indented: false);

    /// <summary>Reads a JSON diagram of format version 3.</summary>
    /// <param name="json">The JSON text.</param>
    /// <returns>The diagram.</returns>
    /// <exception cref="DiagramFormatException">The text is not a version 3 diagram; the message names the path in the document.</exception>
    public static SagaDiagram ParseJson(string json)
    {
        if (json is null)
        {
            throw new ArgumentNullException(nameof(json));
        }

        return DiagramJsonReader.Read(json);
    }
}
