using System;
using System.Collections.Generic;
using System.Linq;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>What a merge dropped: a node or an edge of the existing diagram that the new input no longer has.</summary>
public sealed class MergeRemoval
{
    /// <summary>Creates the entry.</summary>
    /// <param name="isNode"><see langword="true"/> for a node, <see langword="false"/> for an edge.</param>
    /// <param name="id">Its id in the existing diagram.</param>
    /// <param name="message">For people, e.g. <c>“Reserving” removed, its description is lost</c>.</param>
    public MergeRemoval(bool isNode, string id, string message)
    {
        IsNode = isNode;
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Message = message ?? throw new ArgumentNullException(nameof(message));
    }

    /// <summary>A node (otherwise an edge).</summary>
    public bool IsNode { get; }

    /// <summary>Its id in the existing diagram.</summary>
    public string Id { get; }

    /// <summary>For people.</summary>
    public string Message { get; }

    /// <inheritdoc />
    public override string ToString() => Message;
}

/// <summary>The result of <see cref="SagaDiagram.MergeInto"/>.</summary>
public sealed class MergeResult
{
    /// <summary>Creates the result.</summary>
    /// <param name="diagram">The merged diagram.</param>
    /// <param name="removed">What was dropped.</param>
    public MergeResult(SagaDiagram diagram, IEnumerable<MergeRemoval>? removed = null)
    {
        Diagram = diagram ?? throw new ArgumentNullException(nameof(diagram));
        Removed = Lists.Copy(removed);
    }

    /// <summary>The merged diagram.</summary>
    public SagaDiagram Diagram { get; }

    /// <summary>The elements of the existing diagram that the new input does not have, nodes first, in file order.</summary>
    public IReadOnlyList<MergeRemoval> Removed { get; }
}

/// <summary>Thrown when a merge would drop something and the caller asked to fail instead (<c>SaveOptions.FailOnLoss</c>).</summary>
public sealed class DiagramLossException : Exception
{
    /// <summary>Creates the exception.</summary>
    public DiagramLossException()
    {
        Removed = Array.Empty<MergeRemoval>();
    }

    /// <summary>Creates the exception with a message.</summary>
    /// <param name="message">What would be lost.</param>
    public DiagramLossException(string message)
        : base(message)
    {
        Removed = Array.Empty<MergeRemoval>();
    }

    /// <summary>Creates the exception with a message and its cause.</summary>
    /// <param name="message">What would be lost.</param>
    /// <param name="innerException">The cause.</param>
    public DiagramLossException(string message, Exception innerException)
        : base(message, innerException)
    {
        Removed = Array.Empty<MergeRemoval>();
    }

    /// <summary>Creates the exception for a merge result.</summary>
    /// <param name="removed">What would be dropped.</param>
    public DiagramLossException(IReadOnlyList<MergeRemoval> removed)
        : base("Saving would drop " + removed.Count + " element(s) of the existing file; nothing was written. Use SaveOptions.Overwrite or accept the loss.\n" + string.Join("\n", removed.Select(r => "- " + r.Message)))
    {
        Removed = removed;
    }

    /// <summary>What would be dropped.</summary>
    public IReadOnlyList<MergeRemoval> Removed { get; }
}

internal static class DiagramMerge
{
    internal static MergeResult Merge(SagaDiagram existing, SagaDiagram incoming)
    {
        if (existing is null)
        {
            throw new ArgumentNullException(nameof(existing));
        }

        var removed = new List<MergeRemoval>();

        var oldNodeIds = new HashSet<string>(existing.Nodes.Select(n => n.Id), StringComparer.Ordinal);
        var newNodes = new Dictionary<string, DiagramNode>(StringComparer.Ordinal);
        foreach (var node in incoming.Nodes)
        {
            newNodes[node.Id] = node;
        }

        var nodes = new List<DiagramNode>();
        foreach (var old in existing.Nodes)
        {
            if (!newNodes.TryGetValue(old.Id, out var fresh))
            {
                var lost = new List<string>();
                if (old.Description is not null) { lost.Add("description"); }
                if (old.Color is not null) { lost.Add("color"); }
                if (old.Retry is not null) { lost.Add("retry"); }
                if (old.Timeout is not null) { lost.Add("timeout"); }
                if (old.Compensation is not null) { lost.Add("compensation"); }
                var tail = lost.Count == 0 ? string.Empty : ", its " + string.Join(", ", lost) + (lost.Count == 1 ? " is" : " are") + " lost";
                removed.Add(new MergeRemoval(true, old.Id, "“" + old.Name + "” removed" + tail));
                continue;
            }

            nodes.Add(new DiagramNode(
                fresh.Id,
                fresh.Type,
                fresh.Name,
                old.Description ?? fresh.Description,
                old.Color ?? fresh.Color,
                fresh.Activities,
                fresh.Ignores,
                fresh.Requests,
                fresh.RoutingSlips,
                fresh.Timers,
                old.Retry ?? fresh.Retry,
                old.Timeout ?? fresh.Timeout,
                old.Compensation ?? fresh.Compensation));
        }

        nodes.AddRange(incoming.Nodes.Where(n => !oldNodeIds.Contains(n.Id)));

        string NameOf(string id) =>
            existing.Nodes.FirstOrDefault(n => n.Id == id)?.Name ?? incoming.Nodes.FirstOrDefault(n => n.Id == id)?.Name ?? id;

        var oldEdgeKeys = new HashSet<EdgeKey>(existing.Edges.Select(Key));
        var newEdges = new Dictionary<EdgeKey, DiagramEdge>();
        foreach (var edge in incoming.Edges)
        {
            newEdges[Key(edge)] = edge;
        }

        var edges = new List<DiagramEdge>();
        foreach (var old in existing.Edges)
        {
            if (!newEdges.TryGetValue(Key(old), out var fresh))
            {
                removed.Add(new MergeRemoval(
                    false,
                    old.Id,
                    "Transition " + NameOf(old.Source) + " → " + NameOf(old.Target)
                    + (string.IsNullOrEmpty(old.Event) ? string.Empty : " on " + old.Event)
                    + " removed" + (old.EventSource is null ? string.Empty : ", its eventSource is lost")));
                continue;
            }

            edges.Add(new DiagramEdge(old.Id, fresh.Source, fresh.Target, old.Kind, fresh.Event, old.EventSource ?? fresh.EventSource, fresh.Guard));
        }

        edges.AddRange(incoming.Edges.Where(e => !oldEdgeKeys.Contains(Key(e))));

        var diagram = new SagaDiagram(
            nodes,
            edges,
            existing.Name ?? incoming.Name,
            existing.Description ?? incoming.Description,
            incoming.Saga,
            incoming.Events,
            existing.DirectionSet ? existing.Direction : incoming.Direction,
            existing.Spacing ?? incoming.Spacing,
            incoming.Warnings);
        diagram.DirectionSet = existing.DirectionSet || incoming.DirectionSet;
        return new MergeResult(diagram, removed);
    }

    private static EdgeKey Key(DiagramEdge e) => new(e.Source, e.Target, e.Event, e.Guard);

    private readonly struct EdgeKey : IEquatable<EdgeKey>
    {
        private readonly string _source;
        private readonly string _target;
        private readonly string? _event;
        private readonly string? _guard;

        internal EdgeKey(string source, string target, string? @event, string? guard)
        {
            _source = source;
            _target = target;
            _event = @event;
            _guard = guard;
        }

        public bool Equals(EdgeKey other) =>
            _source == other._source && _target == other._target && _event == other._event && _guard == other._guard;

        public override bool Equals(object? obj) => obj is EdgeKey other && Equals(other);

        public override int GetHashCode()
        {
            unchecked
            {
                var h = _source.GetHashCode();
                h = (h * 31) + _target.GetHashCode();
                h = (h * 31) + (_event?.GetHashCode() ?? 0);
                return (h * 31) + (_guard?.GetHashCode() ?? 0);
            }
        }
    }
}
