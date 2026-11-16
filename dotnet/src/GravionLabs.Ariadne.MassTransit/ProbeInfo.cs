using System;
using System.Collections.Generic;
using System.Text.Json;
using MassTransit;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// What the probe of a state machine (<c>IProbeSite</c>, a public JSON-like tree) gives that the visitor does not:
/// the ignored events of a state, the state property and the composite event a member event belongs to.
/// </summary>
internal sealed class ProbeInfo
{
    private ProbeInfo()
    {
    }

    internal string? StateProperty { get; private set; }

    /// <summary>The ignored events by state name, in the order the probe lists them.</summary>
    internal Dictionary<string, List<string>> Ignored { get; } = new Dictionary<string, List<string>>(StringComparer.Ordinal);

    /// <summary>The composite event a member event belongs to, by state name and event name.</summary>
    internal Dictionary<(string State, string Event), string> CompositeOf { get; } = new Dictionary<(string, string), string>();

    /// <summary>Why the probe could not be read, or <see langword="null"/>.</summary>
    internal string? Failure { get; private set; }

    internal static ProbeInfo Read(StateMachine machine)
    {
        var info = new ProbeInfo();
        try
        {
            var results = ((IProbeSite)machine).GetProbeResult().Results;
            using var document = JsonDocument.Parse(JsonSerializer.Serialize(results));
            info.Fill(document.RootElement);
        }
#pragma warning disable CA1031 // The probe is an extra source; whatever it throws is reported as a warning, never thrown.
        catch (Exception exception)
#pragma warning restore CA1031
        {
            info.Failure = exception.GetType().Name + ": " + exception.Message;
        }

        return info;
    }

    private static IEnumerable<JsonElement> Items(JsonElement parent, string name)
    {
        if (parent.ValueKind != JsonValueKind.Object || !parent.TryGetProperty(name, out var value))
        {
            yield break;
        }

        if (value.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in value.EnumerateArray())
            {
                yield return item;
            }
        }
        else if (value.ValueKind == JsonValueKind.Object)
        {
            yield return value;
        }
    }

    private static string? Text(JsonElement parent, string name) =>
        parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private void Fill(JsonElement root)
    {
        foreach (var machine in Items(root, "stateMachine"))
        {
            StateProperty = Text(machine, "currentStateProperty");
            foreach (var state in Items(machine, "state"))
            {
                var stateName = Text(state, "name");
                if (stateName is null)
                {
                    continue;
                }

                foreach (var ignored in Items(state, "event-ignored"))
                {
                    var name = Text(ignored, "name");
                    if (name is not null)
                    {
                        name = HandlerCollector.DiagramName(name);
                        if (!Ignored.TryGetValue(stateName, out var list))
                        {
                            Ignored[stateName] = list = new List<string>();
                        }

                        if (!list.Contains(name))
                        {
                            list.Add(name);
                        }
                    }
                }

                foreach (var ev in Items(state, "event"))
                {
                    var eventName = Text(ev, "name");
                    foreach (var behavior in Items(ev, "behavior"))
                    {
                        foreach (var composite in Items(behavior, "compositeEvent"))
                        {
                            var target = Text(composite, "event");
                            if (eventName is not null && target is not null)
                            {
                                CompositeOf[(stateName, HandlerCollector.DiagramName(eventName))] = HandlerCollector.DiagramName(target);
                            }
                        }
                    }
                }
            }
        }
    }
}
