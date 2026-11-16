using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using MassTransit;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>Turns what the visitor and the probe read from a built state machine into a <see cref="SagaDiagram"/>.</summary>
internal static class DiagramBuilder
{
    /// <summary>
    /// The guard of a transition that sits in a condition. The condition is a compiled delegate: its text is not
    /// in a built state machine, only that there is one.
    /// </summary>
    internal const string UnreadableGuard = "condition in code";

    private const string InitialId = "start-1";
    private const string FinalId = "end-1";
    private const string AnyId = "any-1";

    internal static SagaDiagram Build(StateMachine machine)
    {
        var warnings = new List<DiagramWarning>();
        var collector = new HandlerCollector();
        machine.Accept(collector);

        var probe = ProbeInfo.Read(machine);
        if (probe.Failure is not null)
        {
            warnings.Add(new DiagramWarning(
                "Probe", "The ignored events and the state property could not be read: " + probe.Failure));
        }

        var initial = machine.Initial.Name;
        var final = machine.Final.Name;

        // A state with a dot in its name is not one of the saga: a Request adds "<Name>.Pending" (a property cannot have a dot).
        var stateNames = machine.States
            .Select(s => s.Name)
            .Where(n => n != initial && n != final && n.IndexOf('.') < 0)
            .ToList();
        var compositeNames = new HashSet<string>(probe.CompositeOf.Values, StringComparer.Ordinal);

        var handlersByState = new Dictionary<string, List<HandlerRecord>>(StringComparer.Ordinal);
        foreach (var handler in collector.Handlers)
        {
            if (!handlersByState.TryGetValue(handler.State, out var list))
            {
                handlersByState[handler.State] = list = new List<HandlerRecord>();
            }

            list.Add(handler);
        }

        foreach (var state in handlersByState.Keys.OrderBy(k => k, StringComparer.Ordinal))
        {
            foreach (var handler in handlersByState[state])
            {
                ReportUnreadable(handler, warnings);
            }
        }

        var duringAny = FindDuringAny(stateNames, handlersByState, warnings);

        var nodes = new List<DiagramNode>();
        var ids = new Dictionary<string, string>(StringComparer.Ordinal) { [initial] = InitialId };
        foreach (var name in stateNames)
        {
            var id = UniqueId("state-" + Kebab(name), ids.Values);
            ids[name] = id;
        }

        var edgeSpecs = new List<EdgeSpec>();
        var joins = new List<string>();
        var eventsUsed = new List<string>();
        var messageTypes = machine.Events
            .Select(e => (Name: HandlerCollector.DiagramName(e.Name), Type: MessageTypeOf(e)))
            .Where(e => e.Type is not null)
            .GroupBy(e => e.Name, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First().Type!, StringComparer.Ordinal);
        var usedFinal = false;

        void Use(string eventName)
        {
            if (!eventsUsed.Contains(eventName))
            {
                eventsUsed.Add(eventName);
            }
        }

        void AddEdge(string source, string target, string eventName, string? guard)
        {
            var spec = new EdgeSpec(source, target, eventName, guard);
            if (!edgeSpecs.Contains(spec))
            {
                edgeSpecs.Add(spec);
                Use(eventName);
            }
        }

        string? TargetId(string targetName, string state, string eventName)
        {
            if (targetName == final)
            {
                usedFinal = true;
                return FinalId;
            }

            if (targetName == initial)
            {
                warnings.Add(new DiagramWarning(
                    "TransitionTo", "A transition into the initial state is not shown: nothing enters it.", state, eventName));
                return null;
            }

            return ids.TryGetValue(targetName, out var id) ? id : null;
        }

        // What a state does on entry: WhenEnter first, then what the transitions into it do, as the importer orders it.
        var entering = new Dictionary<string, List<ItemRecord>>(StringComparer.Ordinal);
        var arriving = new Dictionary<string, List<ItemRecord>>(StringComparer.Ordinal);

        void Take(Dictionary<string, List<ItemRecord>> into, string state, IEnumerable<ItemRecord> items)
        {
            if (!into.TryGetValue(state, out var list))
            {
                into[state] = list = new List<ItemRecord>();
            }

            list.AddRange(items);
        }

        // The items of a transition go to the state it leads into.
        void Place(HandlerRecord handler, TransitionRecord transition, string targetName, bool intoJoin)
        {
            var items = transition.Scope.ItemsOnTheWay().ToList();
            if (items.Count == 0)
            {
                return;
            }

            var names = string.Join(", ", items.Select(Describe));
            if (targetName == final)
            {
                warnings.Add(new DiagramWarning(
                    "Finalize", names + " on the way to the final state cannot be shown: nothing happens in a final state.", handler.State, handler.EventName));
            }
            else if (intoJoin)
            {
                warnings.Add(new DiagramWarning(
                    "CompositeEvent", names + " on an event that counts towards a join cannot be shown.", handler.State, handler.EventName));
            }
            else if (ids.ContainsKey(targetName) && targetName != initial)
            {
                Take(arriving, targetName, items);
            }
        }

        string JoinId(string composite)
        {
            if (!joins.Contains(composite))
            {
                joins.Add(composite);
                ids["join:" + composite] = UniqueId("join-" + Kebab(composite), ids.Values);
            }

            return ids["join:" + composite];
        }

        var sources = new List<string> { initial };
        sources.AddRange(stateNames);
        foreach (var state in sources)
        {
            if (!handlersByState.TryGetValue(state, out var handlers))
            {
                continue;
            }

            var isInitial = state == initial;
            var sourceId = ids[state];
            foreach (var handler in handlers)
            {
                if (handler.Role != HandlerRole.Normal || duringAny.Copies.Contains(handler))
                {
                    continue;
                }

                var transitions = handler.Transitions.Where(t => !t.Caught).ToList();
                if (compositeNames.Contains(handler.EventName))
                {
                    // The event a composite event raises: the way on leaves the join.
                    var joinId = JoinId(handler.EventName);
                    foreach (var transition in transitions)
                    {
                        var target = TargetId(transition.Target, state, handler.EventName);
                        if (target is not null)
                        {
                            AddEdge(joinId, target, handler.EventName, transition.Guard);
                            Place(handler, transition, transition.Target, false);
                        }
                    }

                    if (transitions.Count == 0)
                    {
                        warnings.Add(new DiagramWarning(
                            "CompositeEvent", "The handler of the composite event has no transition: the join is left out.", state, handler.EventName));
                    }

                    continue;
                }

                if (handler.IsCompositeMember && probe.CompositeOf.TryGetValue((state, handler.EventName), out var composite))
                {
                    if (handlers.Any(h => h.EventName == composite && h.Role == HandlerRole.Normal && h.Transitions.Any(t => !t.Caught)))
                    {
                        AddEdge(sourceId, JoinId(composite), handler.EventName, null);
                        var counted = handler.Root.ItemsOnTheWay().ToList();
                        if (counted.Count > 0)
                        {
                            warnings.Add(new DiagramWarning(
                                "CompositeEvent",
                                string.Join(", ", counted.Select(Describe)) + " on an event that counts towards a join cannot be shown.",
                                state,
                                handler.EventName));
                        }
                    }
                }

                foreach (var transition in transitions)
                {
                    var target = TargetId(transition.Target, state, handler.EventName);
                    if (target is not null)
                    {
                        AddEdge(sourceId, target, handler.EventName, transition.Guard);
                        Place(handler, transition, transition.Target, false);
                    }
                }

                // Events with a dot in the name (Request.Completed, Request.Faulted) are added to every state by MassTransit
                // itself, to drop late replies: a handler of them without a transition is not a loop of the saga.
                if (transitions.Count == 0 && !handler.IsCompositeMember && handler.EventName.IndexOf('.') < 0)
                {
                    if (isInitial)
                    {
                        warnings.Add(new DiagramWarning(
                            "Initially", "A handler that stays in the initial state is not shown.", state, handler.EventName));
                    }
                    else
                    {
                        AddEdge(sourceId, sourceId, handler.EventName, null);
                        var stays = handler.Root.ItemsOnTheWay().ToList();
                        if (stays.Count > 0)
                        {
                            warnings.Add(new DiagramWarning(
                                "Stays",
                                "The event keeps the saga in " + state + "; " + string.Join(", ", stays.Select(Describe)) + " is shown on entering it.",
                                state,
                                handler.EventName));
                            Take(arriving, state, stays);
                        }
                    }
                }
            }
        }

        foreach (var handler in duringAny.Representatives)
        {
            foreach (var transition in handler.Transitions.Where(t => !t.Caught))
            {
                var target = TargetId(transition.Target, handler.State, handler.EventName);
                if (target is not null)
                {
                    AddEdge(AnyId, target, handler.EventName, transition.Guard);
                    Place(handler, transition, transition.Target, false);
                }
            }

            if (handler.Transitions.All(t => t.Caught))
            {
                warnings.Add(new DiagramWarning(
                    "DuringAny", "A handler for every state without a transition is not shown.", null, handler.EventName));
            }
        }

        // WhenEnter(State, …) is the event "<State>.Enter" under that state. For the final state (Finally) MassTransit lists it
        // under every state: it is read once, from the first handler that has it.
        var entered = new HashSet<string>(StringComparer.Ordinal);
        foreach (var handler in collector.Handlers.Where(h => h.Role == HandlerRole.Enter))
        {
            var entry = handler.EventName.Substring(0, handler.EventName.Length - ".Enter".Length);
            if (entry != handler.State && entry != final || !entered.Add(entry))
            {
                continue;
            }

            var items = handler.Root.ItemsOnTheWay().ToList();
            if (items.Count == 0)
            {
                continue;
            }

            if (entry == final || entry == initial)
            {
                warnings.Add(new DiagramWarning(
                    entry == final ? "Finally" : "WhenEnter",
                    string.Join(", ", items.Select(Describe)) + " in the " + (entry == final ? "final" : "initial") + " state cannot be shown: nothing runs there.",
                    entry,
                    handler.EventName));
            }
            else if (ids.ContainsKey(entry) && entry.IndexOf('.') < 0)
            {
                Take(entering, entry, items);
            }
        }

        var ignores = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        foreach (var state in stateNames)
        {
            if (probe.Ignored.TryGetValue(state, out var ignored))
            {
                ignores[state] = ignored;
                foreach (var name in ignored)
                {
                    Use(name);
                }
            }
        }

        if (probe.Ignored.TryGetValue(initial, out var initialIgnored))
        {
            foreach (var name in initialIgnored)
            {
                warnings.Add(new DiagramWarning(
                    "Ignore", "The format has no place for an ignored event on the initial state: left out.", initial, name));
            }
        }

        nodes.Add(new DiagramNode(InitialId, NodeType.Start, initial));
        foreach (var name in stateNames)
        {
            var things = new List<ItemRecord>();
            if (entering.TryGetValue(name, out var onEnter))
            {
                things.AddRange(onEnter);
            }

            if (arriving.TryGetValue(name, out var onArrival))
            {
                things.AddRange(onArrival);
            }

            nodes.Add(new DiagramNode(
                ids[name],
                NodeType.State,
                name,
                activities: things
                    .Where(t => t.Kind == ItemKind.Command || t.Kind == ItemKind.Event)
                    .Select(t => new Activity(t.Kind == ItemKind.Command ? MessageKind.Command : MessageKind.Event, t.Name))
                    .Distinct(ActivityComparer.Instance),
                ignores: ignores.TryGetValue(name, out var list) ? list : null,
                requests: things
                    .Where(t => t.Kind == ItemKind.Request)
                    .GroupBy(t => t.Name, StringComparer.Ordinal)
                    .Select(g => new Request(g.Key, g.Select(t => t.Detail).FirstOrDefault(d => d is not null))),
                timers: things
                    .Where(t => t.Kind == ItemKind.Schedule || t.Kind == ItemKind.Unschedule)
                    .GroupBy(t => (t.Kind, t.Name))
                    .Select(g => new Timer(
                        g.Key.Kind == ItemKind.Schedule ? TimerAction.Schedule : TimerAction.Unschedule,
                        g.Key.Name,
                        g.Select(t => t.Detail).FirstOrDefault(d => d is not null)))));
        }

        if (usedFinal)
        {
            nodes.Add(new DiagramNode(FinalId, NodeType.End, final));
        }

        if (edgeSpecs.Any(e => e.Source == AnyId))
        {
            nodes.Add(new DiagramNode(AnyId, NodeType.Any, "Any state"));
        }

        foreach (var composite in joins)
        {
            nodes.Add(new DiagramNode(ids["join:" + composite], NodeType.Join, composite));
        }

        var edges = edgeSpecs
            .Select((e, i) => new DiagramEdge(
                "edge-" + (i + 1).ToString(CultureInfo.InvariantCulture), e.Source, e.Target, EdgeKind.Forward, e.Event, null, e.Guard))
            .ToList();

        var events = new List<EventInfo>();
        var messageNamespaces = new List<string>();
        foreach (var name in eventsUsed)
        {
            if (!messageTypes.TryGetValue(name, out var type))
            {
                type = collector.Handlers.FirstOrDefault(h => h.EventName == name && h.MessageType is not null)?.MessageType;
            }

            if (type is null)
            {
                continue;
            }

            if (type.Namespace is not null && !messageNamespaces.Contains(type.Namespace))
            {
                messageNamespaces.Add(type.Namespace);
            }

            var typeName = TypeName(type);
            if (typeName != name)
            {
                events.Add(new EventInfo(name, typeName));
            }
        }

        ReportCorrelations(machine, warnings);

        var className = machine.GetType().Name;
        var saga = new SagaInfo(
            className: StripArity(className),
            @namespace: machine.GetType().Namespace,
            instanceType: StripArity(machine.InstanceType.Name),
            stateProperty: probe.StateProperty,
            contractsNamespace: messageNamespaces.Count == 1 && messageNamespaces[0] != machine.GetType().Namespace
                ? messageNamespaces[0]
                : null);

        // The same thing found in several states (a copy of DuringAny, a handler MassTransit lists everywhere) is said once.
        var distinct = new List<DiagramWarning>();
        var said = new HashSet<string>(StringComparer.Ordinal);
        foreach (var warning in warnings)
        {
            if (said.Add(warning.ToString()))
            {
                distinct.Add(warning);
            }
        }

        return new SagaDiagram(nodes, edges, DiagramTitle(className), null, saga, events, warnings: distinct);
    }

    private static string Describe(ItemRecord item) => item.Kind switch
    {
        ItemKind.Request => "Request " + item.Name,
        ItemKind.Schedule => "Schedule " + item.Name,
        ItemKind.Unschedule => "Unschedule " + item.Name,
        _ => item.Name,
    };

    private sealed class ActivityComparer : IEqualityComparer<Activity>
    {
        internal static readonly ActivityComparer Instance = new ActivityComparer();

        public bool Equals(Activity? x, Activity? y) => x is not null && y is not null && x.Kind == y.Kind && x.Name == y.Name;

        public int GetHashCode(Activity obj) => StringComparer.Ordinal.GetHashCode(obj.Name) ^ (int)obj.Kind;
    }

    private static void ReportUnreadable(HandlerRecord handler, List<DiagramWarning> warnings)
    {
        foreach (var (construct, message) in handler.Problems)
        {
            warnings.Add(new DiagramWarning(construct, message, handler.State, handler.EventName));
        }

        if (handler.MessageType is not null
            && (handler.MessageType.Name == "RoutingSlipCompleted" || handler.MessageType.Name == "RoutingSlipFaulted"))
        {
            warnings.Add(new DiagramWarning(
                "RoutingSlip",
                "The itinerary of a routing slip is built in code and cannot be read from a built state machine: only its outcome is shown.",
                handler.State,
                handler.EventName));
        }

        switch (handler.Role)
        {
            case HandlerRole.Leave:
            case HandlerRole.BeforeEnter:
            case HandlerRole.AfterLeave:
                warnings.Add(new DiagramWarning(
                    handler.Role == HandlerRole.Leave ? "WhenLeave" : handler.Role == HandlerRole.BeforeEnter ? "BeforeEnter" : "AfterLeave",
                    "The format has no place for it: left out.",
                    handler.State,
                    handler.EventName));
                return;
            case HandlerRole.Enter:
                if (handler.Transitions.Count > 0)
                {
                    warnings.Add(new DiagramWarning(
                        "WhenEnter", "A transition in WhenEnter is not shown.", handler.State, handler.EventName));
                }

                return;
            case HandlerRole.Internal:
                return;
            default:
                break;
        }

        if (handler.RunsCode)
        {
            warnings.Add(new DiagramWarning(
                "Then", "Code in Then or ThenAsync cannot be read from a built state machine.", handler.State, handler.EventName));
        }

        if (handler.HasCondition)
        {
            warnings.Add(new DiagramWarning(
                "If", "The text of a condition (If, IfElse, When with a filter) is a compiled delegate, not source text, and cannot be read; its transitions get the guard '" + UnreadableGuard + "' (the negation '!(" + UnreadableGuard + ")' for the way out).", handler.State, handler.EventName));
        }

        if (handler.HasCatch)
        {
            warnings.Add(new DiagramWarning(
                "Catch", "The transitions in Catch or Fault are not shown.", handler.State, handler.EventName));
        }
    }

    /// <summary>
    /// <c>DuringAny</c> leaves no trace: MassTransit copies its handlers into every state but the initial and the
    /// final one. A handler of the first such state that every one of them has, with the same transitions, is
    /// treated as one. Needs at least two states, or it could be a <c>During</c> of the only state.
    /// </summary>
    private static DuringAnyResult FindDuringAny(
        List<string> stateNames, Dictionary<string, List<HandlerRecord>> handlersByState, List<DiagramWarning> warnings)
    {
        var result = new DuringAnyResult();
        if (stateNames.Count < 2 || !handlersByState.TryGetValue(stateNames[0], out var first))
        {
            return result;
        }

        foreach (var candidate in first.Where(h => h.Role == HandlerRole.Normal && !h.IsCompositeMember && (h.Transitions.Count > 0 || h.EventName.IndexOf('.') < 0)))
        {
            var signature = Signature(candidate);
            var copies = new List<HandlerRecord> { candidate };
            foreach (var other in stateNames.Skip(1))
            {
                var copy = handlersByState.TryGetValue(other, out var list)
                    ? list.FirstOrDefault(h => h.Role == HandlerRole.Normal && h.EventName == candidate.EventName && Signature(h) == signature)
                    : null;
                if (copy is null)
                {
                    break;
                }

                copies.Add(copy);
            }

            if (copies.Count == stateNames.Count)
            {
                result.Representatives.Add(candidate);
                foreach (var copy in copies)
                {
                    result.Copies.Add(copy);
                }

                warnings.Add(new DiagramWarning(
                    "DuringAny",
                    "MassTransit copies DuringAny into every state, so it cannot be told from During written for each: a handler every state has, with the same transitions, is shown as one transition of the any node.",
                    null,
                    candidate.EventName));
            }
        }

        return result;
    }

    /// <summary>The handlers of the first state stand for the transitions of the any node; every copy is dropped from its state.</summary>
    private sealed class DuringAnyResult
    {
        internal List<HandlerRecord> Representatives { get; } = new List<HandlerRecord>();

        internal HashSet<HandlerRecord> Copies { get; } = new HashSet<HandlerRecord>();
    }

    private static string Signature(HandlerRecord handler) =>
        string.Join(
            ";",
            handler.Transitions.Select(t => t.Target + (t.Guarded ? "?" : string.Empty) + (t.Caught ? "!" : string.Empty)));

    private static string Kebab(string name)
    {
        var builder = new StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsLetterOrDigit(c) && c < 128)
            {
                if (char.IsUpper(c) && i > 0 && (char.IsLower(name[i - 1]) || char.IsDigit(name[i - 1])))
                {
                    builder.Append('-');
                }

                builder.Append(char.ToLowerInvariant(c));
            }
            else if (builder.Length > 0 && builder[builder.Length - 1] != '-')
            {
                builder.Append('-');
            }
        }

        return builder.ToString().Trim('-');
    }

    private static string UniqueId(string baseId, IEnumerable<string> taken)
    {
        var set = new HashSet<string>(taken, StringComparer.Ordinal);
        if (!set.Contains(baseId))
        {
            return baseId;
        }

        for (var n = 1; ; n++)
        {
            var candidate = baseId + "-" + n.ToString(CultureInfo.InvariantCulture);
            if (!set.Contains(candidate))
            {
                return candidate;
            }
        }
    }

    private static string StripArity(string name)
    {
        var index = name.IndexOf('`');
        return index < 0 ? name : name.Substring(0, index);
    }

    private static string DiagramTitle(string className)
    {
        var name = StripArity(className);
        const string suffix = "StateMachine";
        return name.Length > suffix.Length && name.EndsWith(suffix, StringComparison.Ordinal)
            ? name.Substring(0, name.Length - suffix.Length)
            : name;
    }

    internal static string TypeName(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.Name;
        }

        return StripArity(type.Name) + "<" + string.Join(", ", type.GetGenericArguments().Select(TypeName)) + ">";
    }

    private static Type? MessageTypeOf(Event @event)
    {
        var type = @event.GetType();
        while (type is not null)
        {
            if (type.IsGenericType && type.GetGenericTypeDefinition().Name.StartsWith("MessageEvent", StringComparison.Ordinal))
            {
                return type.GetGenericArguments()[0];
            }

            type = type.BaseType;
        }

        return null;
    }

    /// <summary>
    /// A correlation by an expression (<c>CorrelateBy</c>, no message filter) is a compiled delegate; the default,
    /// <c>CorrelateById</c> and <c>CorrelateBy(…).SelectId(…)</c> are filters on the correlation id. The text of an
    /// expression is not in a built state machine, so the correlation of the diagram is left empty and the first kind is reported.
    /// </summary>
    private static void ReportCorrelations(StateMachine machine, List<DiagramWarning> warnings)
    {
        if (machine.GetType().GetProperty("Correlations")?.GetValue(machine) is not IEnumerable correlations)
        {
            return;
        }

        foreach (var correlation in correlations)
        {
            var type = correlation.GetType();
            var filterProperty = type.GetProperty("MessageFilter");
            var filter = filterProperty?.GetValue(correlation);
            var name = HandlerCollector.DiagramName((type.GetProperty("Event")?.GetValue(correlation) as Event)?.Name ?? string.Empty);
            if (filterProperty is not null && name.Length > 0
                && (filter is null || !filter.GetType().Name.StartsWith("CorrelationIdMessageFilter", StringComparison.Ordinal)))
            {
                warnings.Add(new DiagramWarning(
                    "Correlation", "The correlation is an expression and cannot be read from a built state machine: left out.", null, name));
            }
        }
    }

    private sealed class EdgeSpec : IEquatable<EdgeSpec>
    {
        internal EdgeSpec(string source, string target, string @event, string? guard)
        {
            Source = source;
            Target = target;
            Event = @event;
            Guard = guard;
        }

        internal string Source { get; }

        internal string Target { get; }

        internal string Event { get; }

        internal string? Guard { get; }

        public bool Equals(EdgeSpec? other) =>
            other is not null && Source == other.Source && Target == other.Target && Event == other.Event && Guard == other.Guard;

        public override bool Equals(object? obj) => Equals(obj as EdgeSpec);

        public override int GetHashCode() => StringComparer.Ordinal.GetHashCode(Source + "|" + Target + "|" + Event);
    }
}
