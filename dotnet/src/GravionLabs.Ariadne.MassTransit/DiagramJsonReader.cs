using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// Reads a version 3 JSON diagram. The checks and the messages are those of <c>@ariadne/core</c>; every message
/// starts with the path in the document (<c>nodes[2].type</c>). Keys the format does not know (and <c>$schema</c>)
/// are ignored, like the TypeScript reader does.
/// </summary>
internal static class DiagramJsonReader
{
    // The limits of the TypeScript reader (docs/specs/diagram-format.md, "Limits").
    private const int MaxBytes = 5_000_000;
    private const int MaxNodes = 5_000;
    private const int MaxEdges = 20_000;

    private static readonly string[] Colors = { "red", "orange", "amber", "green", "teal", "blue", "purple", "pink" };
    private static readonly Regex HexColor = new("^#[0-9a-fA-F]{6}$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

    internal static SagaDiagram Read(string json)
    {
        if (json.Length * 3 > MaxBytes && Encoding.UTF8.GetByteCount(json) > MaxBytes)
        {
            throw new DiagramFormatException(
                $"The document is {Encoding.UTF8.GetByteCount(json) / 1_000_000.0:0.#} MB; diagrams up to {MaxBytes / 1_000_000} MB are read.");
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return Read(document.RootElement);
        }
        catch (JsonException e)
        {
            var where = e.Path is { Length: > 0 } path && path != "$" ? $" at {path}" : string.Empty;
            throw new DiagramFormatException($"Not valid JSON{where}: {e.Message}", e);
        }
        catch (InvalidOperationException e)
        {
            // System.Text.Json cannot read a string with a lone surrogate (\ud800 without its pair).
            throw new DiagramFormatException($"Not valid JSON: {e.Message}", e);
        }
    }

    internal static SagaDiagram Read(JsonElement root)
    {
        var file = AsObject(root, "the document");
        CheckVersion(file);

        var direction = Direction.TopBottom;
        if (file.TryGetProperty("direction", out var rawDirection))
        {
            direction = (Direction)EnumIndex(rawDirection, "direction", DiagramNames.Directions);
        }

        Spacing? spacing = null;
        if (file.TryGetProperty("spacing", out var rawSpacing))
        {
            var value = (Spacing)EnumIndex(rawSpacing, "spacing", DiagramNames.Spacings);
            spacing = value == Spacing.Normal ? null : value;
        }

        var nodeItems = Items(file, "nodes");
        if (nodeItems.Count > MaxNodes)
        {
            throw new DiagramFormatException($"The document has {nodeItems.Count} nodes; diagrams with up to {MaxNodes} are read.");
        }

        var nodes = new List<DiagramNode>(nodeItems.Count);
        for (var i = 0; i < nodeItems.Count; i++)
        {
            nodes.Add(ReadNode(nodeItems[i], $"nodes[{i}]"));
        }

        var anyCount = 0;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var node in nodes)
        {
            if (node.Type == NodeType.Any && ++anyCount > 1)
            {
                throw new DiagramFormatException("nodes: there can be only one node of type \"any\"");
            }

            if (!ids.Add(node.Id))
            {
                throw new DiagramFormatException($"nodes: duplicate node id \"{node.Id}\"");
            }
        }

        var edgeItems = Items(file, "edges");
        if (edgeItems.Count > MaxEdges)
        {
            throw new DiagramFormatException($"The document has {edgeItems.Count} edges; diagrams with up to {MaxEdges} are read.");
        }

        var edges = new List<DiagramEdge>(edgeItems.Count);
        for (var i = 0; i < edgeItems.Count; i++)
        {
            edges.Add(ReadEdge(edgeItems[i], $"edges[{i}]", ids));
        }

        return new SagaDiagram(
            nodes,
            edges,
            Trimmed(file, "name", "name"),
            Trimmed(file, "description", "description"),
            file.TryGetProperty("saga", out var saga) ? ReadSaga(saga) : null,
            file.TryGetProperty("events", out var events) ? ReadEvents(events) : null,
            direction,
            spacing);
    }

    private static void CheckVersion(JsonElement file)
    {
        if (!file.TryGetProperty("version", out var version))
        {
            throw new DiagramFormatException($"version is missing (expected {AriadneFormat.Version})");
        }

        if (version.ValueKind != JsonValueKind.Number || !version.TryGetDouble(out var number) || number != AriadneFormat.Version)
        {
            var shown = version.GetRawText();
            throw new DiagramFormatException($"version: unsupported format version {shown} (expected {AriadneFormat.Version})");
        }
    }

    private static SagaInfo? ReadSaga(JsonElement value)
    {
        var block = AsObject(value, "saga");
        var saga = new SagaInfo(
            Trimmed(block, "class", "saga.class"),
            Trimmed(block, "namespace", "saga.namespace"),
            Trimmed(block, "instance", "saga.instance"),
            Trimmed(block, "stateProperty", "saga.stateProperty"),
            Trimmed(block, "contractsNamespace", "saga.contractsNamespace"),
            Trimmed(block, "source", "saga.source"));
        return saga.IsEmpty ? null : saga;
    }

    private static List<EventInfo> ReadEvents(JsonElement value)
    {
        var events = new List<EventInfo>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var items = AsArray(value, "events");
        for (var i = 0; i < items.Count; i++)
        {
            var at = $"events[{i}]";
            var entry = AsObject(items[i], at);
            var name = RequiredString(entry, "name", at + ".name");
            if (!seen.Add(name))
            {
                throw new DiagramFormatException($"{at}: the event \"{name}\" is described twice");
            }

            events.Add(new EventInfo(name, Trimmed(entry, "messageType", at + ".messageType"), Trimmed(entry, "correlation", at + ".correlation")));
        }

        return events;
    }

    private static DiagramNode ReadNode(JsonElement value, string at)
    {
        var node = AsObject(value, at);
        var type = node.TryGetProperty("type", out var rawType) && rawType.ValueKind == JsonValueKind.String
            ? Array.IndexOf(DiagramNames.NodeTypes, rawType.GetString())
            : -1;
        if (type < 0)
        {
            throw new DiagramFormatException($"{at}.type must be one of {string.Join(", ", DiagramNames.NodeTypes)}");
        }

        var nodeType = (NodeType)type;
        string? color = null;
        if (node.TryGetProperty("color", out var rawColor))
        {
            color = rawColor.ValueKind == JsonValueKind.String ? rawColor.GetString() : null;
            if (color is null || (Array.IndexOf(Colors, color) < 0 && !HexColor.IsMatch(color)))
            {
                throw new DiagramFormatException($"{at}.color must be one of {string.Join(", ", Colors)} or a #rrggbb value");
            }
        }

        var isState = nodeType == NodeType.State;
        if (node.TryGetProperty("activities", out _) && !isState)
        {
            var what = nodeType switch
            {
                NodeType.End => "the final state",
                NodeType.Start => "the initial state",
                NodeType.Any => "the \"any\" node",
                _ => "a join",
            };
            throw new DiagramFormatException($"{at}.activities is only allowed on states, not on {what}");
        }

        foreach (var key in new[] { "ignores", "requests", "routingSlips", "timers" })
        {
            if (node.TryGetProperty(key, out _) && !isState)
            {
                throw new DiagramFormatException($"{at}.{key} is only allowed on states");
            }
        }

        Compensation? compensation = null;
        if (node.TryGetProperty("compensation", out var rawCompensation))
        {
            var c = AsObject(rawCompensation, at + ".compensation");
            compensation = new Compensation(
                RequiredString(c, "name", at + ".compensation.name"),
                OptionalString(c, "description", at + ".compensation.description"));
        }

        var ignores = new List<string>();
        foreach (var (item, i) in Enumerate(node, "ignores", at))
        {
            ignores.Add(StringValue(item, $"{at}.ignores[{i}]"));
        }

        var requests = new List<Request>();
        foreach (var (item, i) in Enumerate(node, "requests", at))
        {
            var p = $"{at}.requests[{i}]";
            var entry = AsObject(item, p);
            if (!entry.TryGetProperty("request", out _))
            {
                throw new DiagramFormatException($"{p} must be \"request: <Name>\"");
            }

            requests.Add(new Request(RequiredString(entry, "request", p + ".request"), Trimmed(entry, "timeout", p + ".timeout")));
        }

        var routingSlips = new List<RoutingSlip>();
        foreach (var (item, i) in Enumerate(node, "routingSlips", at))
        {
            routingSlips.Add(ReadRoutingSlip(item, $"{at}.routingSlips[{i}]"));
        }

        var timers = new List<Timer>();
        foreach (var (item, i) in Enumerate(node, "timers", at))
        {
            timers.Add(ReadTimer(item, $"{at}.timers[{i}]"));
        }

        var activities = new List<Activity>();
        foreach (var (item, i) in Enumerate(node, "activities", at))
        {
            activities.Add(ReadActivity(item, $"{at}.activities[{i}]"));
        }

        return new DiagramNode(
            RequiredString(node, "id", at + ".id"),
            nodeType,
            RequiredString(node, "name", at + ".name"),
            OptionalString(node, "description", at + ".description"),
            color,
            activities,
            ignores,
            requests,
            routingSlips,
            timers,
            OptionalString(node, "retry", at + ".retry"),
            OptionalString(node, "timeout", at + ".timeout"),
            compensation);
    }

    private static RoutingSlip ReadRoutingSlip(JsonElement value, string at)
    {
        var entry = AsObject(value, at);
        if (!entry.TryGetProperty("routingSlip", out _))
        {
            throw new DiagramFormatException($"{at} must be \"routingSlip: <Name>\"");
        }

        var activities = new List<SlipActivity>();
        foreach (var (item, i) in Enumerate(entry, "activities", at))
        {
            var where = $"{at}.activities[{i}]";
            var a = AsObject(item, where);
            if (!a.TryGetProperty("activity", out _))
            {
                throw new DiagramFormatException($"{where} must be \"activity: <Name>\"");
            }

            var compensates = false;
            if (a.TryGetProperty("compensates", out var raw))
            {
                if (raw.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                {
                    throw new DiagramFormatException($"{where}.compensates must be true or false");
                }

                compensates = raw.GetBoolean();
            }

            activities.Add(new SlipActivity(RequiredString(a, "activity", where + ".activity"), compensates));
        }

        return new RoutingSlip(RequiredString(entry, "routingSlip", at + ".routingSlip"), activities);
    }

    private static Timer ReadTimer(JsonElement value, string at)
    {
        var entry = AsObject(value, at);
        var hasSchedule = entry.TryGetProperty("schedule", out _);
        var hasUnschedule = entry.TryGetProperty("unschedule", out _);
        if (hasSchedule == hasUnschedule)
        {
            throw new DiagramFormatException($"{at} must be \"schedule: <Name>\" or \"unschedule: <Name>\"");
        }

        var action = hasSchedule ? TimerAction.Schedule : TimerAction.Unschedule;
        var key = DiagramNames.Of(action);
        var delay = Trimmed(entry, "delay", at + ".delay");
        if (delay is not null && action == TimerAction.Unschedule)
        {
            throw new DiagramFormatException($"{at}.delay is only allowed with schedule");
        }

        return new Timer(action, RequiredString(entry, key, $"{at}.{key}"), delay);
    }

    private static Activity ReadActivity(JsonElement value, string at)
    {
        var entry = AsObject(value, at);
        var properties = new List<JsonProperty>();
        foreach (var property in entry.EnumerateObject())
        {
            properties.Add(property);
        }

        if (properties.Count != 1 || (properties[0].Name != "command" && properties[0].Name != "event"))
        {
            throw new DiagramFormatException($"{at} must be \"command: <Name>\" or \"event: <Name>\"");
        }

        var kind = properties[0].Name == "command" ? MessageKind.Command : MessageKind.Event;
        return new Activity(kind, RequiredString(entry, properties[0].Name, $"{at}.{properties[0].Name}"));
    }

    private static DiagramEdge ReadEdge(JsonElement value, string at, HashSet<string> nodeIds)
    {
        var edge = AsObject(value, at);
        var kind = EdgeKind.Forward;
        if (edge.TryGetProperty("kind", out var rawKind))
        {
            kind = (EdgeKind)EnumIndex(rawKind, at + ".kind", DiagramNames.EdgeKinds);
        }

        if (edge.TryGetProperty("activities", out _))
        {
            throw new DiagramFormatException($"{at}.activities is not allowed: activities belong to states (nodes[].activities)");
        }

        var guard = Trimmed(edge, "guard", at + ".guard");
        var @event = NonEmpty(OptionalString(edge, "event", at + ".event"));
        if (guard is not null && @event is null)
        {
            throw new DiagramFormatException($"{at}.guard needs an event: a guard is a condition on an event");
        }

        var source = RequiredString(edge, "source", at + ".source");
        var target = RequiredString(edge, "target", at + ".target");
        if (!nodeIds.Contains(source))
        {
            throw new DiagramFormatException($"{at}.source \"{source}\" is not a node");
        }

        if (!nodeIds.Contains(target))
        {
            throw new DiagramFormatException($"{at}.target \"{target}\" is not a node");
        }

        return new DiagramEdge(
            RequiredString(edge, "id", at + ".id"),
            source,
            target,
            kind,
            @event,
            NonEmpty(OptionalString(edge, "eventSource", at + ".eventSource")),
            guard);
    }

    private static int EnumIndex(JsonElement value, string at, string[] names)
    {
        var index = value.ValueKind == JsonValueKind.String ? Array.IndexOf(names, value.GetString()) : -1;
        return index >= 0
            ? index
            : throw new DiagramFormatException($"{at} must be one of {string.Join(", ", names)}");
    }

    private static JsonElement AsObject(JsonElement value, string at)
    {
        return value.ValueKind == JsonValueKind.Object ? value : throw new DiagramFormatException($"{at} must be an object");
    }

    private static List<JsonElement> AsArray(JsonElement value, string at)
    {
        if (value.ValueKind != JsonValueKind.Array)
        {
            throw new DiagramFormatException($"{at} must be an array");
        }

        var list = new List<JsonElement>(value.GetArrayLength());
        foreach (var item in value.EnumerateArray())
        {
            list.Add(item);
        }

        return list;
    }

    private static List<JsonElement> Items(JsonElement parent, string key)
    {
        return parent.TryGetProperty(key, out var value) ? AsArray(value, key) : new List<JsonElement>();
    }

    private static IEnumerable<(JsonElement Item, int Index)> Enumerate(JsonElement parent, string key, string at)
    {
        if (!parent.TryGetProperty(key, out var value))
        {
            yield break;
        }

        var items = AsArray(value, $"{at}.{key}");
        for (var i = 0; i < items.Count; i++)
        {
            yield return (items[i], i);
        }
    }

    private static string StringValue(JsonElement value, string at)
    {
        return value.ValueKind == JsonValueKind.String && value.GetString() is { Length: > 0 } text
            ? text
            : throw new DiagramFormatException($"{at} must be a non-empty string");
    }

    private static string RequiredString(JsonElement parent, string key, string at)
    {
        return parent.TryGetProperty(key, out var value)
            ? StringValue(value, at)
            : throw new DiagramFormatException($"{at} must be a non-empty string");
    }

    private static string? OptionalString(JsonElement parent, string key, string at)
    {
        if (!parent.TryGetProperty(key, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : throw new DiagramFormatException($"{at} must be a string");
    }

    /// <summary>The optional string, trimmed; empty after trimming is unset (as in the TypeScript reader).</summary>
    private static string? Trimmed(JsonElement parent, string key, string at)
    {
        return NonEmpty(OptionalString(parent, key, at)?.Trim());
    }

    private static string? NonEmpty(string? value) => string.IsNullOrEmpty(value) ? null : value;
}
