using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace GravionLabs.Ariadne.MassTransit;

internal static class Lists
{
    internal static IReadOnlyList<T> Copy<T>(IEnumerable<T>? items)
    {
        return items is null ? Array.Empty<T>() : new ReadOnlyCollection<T>(new List<T>(items));
    }
}

/// <summary>What generating or importing C# needs to know about the saga (<c>saga</c>). All parts are optional.</summary>
public sealed class SagaInfo
{
    /// <summary>Creates the block.</summary>
    /// <param name="className">The state machine class.</param>
    /// <param name="namespace">Namespace of the state machine and the saga instance.</param>
    /// <param name="instanceType">The saga instance type.</param>
    /// <param name="stateProperty">The instance property holding the current state.</param>
    /// <param name="contractsNamespace">Namespace of the message contracts, when not the saga's.</param>
    /// <param name="source">The C# file that implements the saga, relative to the diagram file, with <c>/</c> as separator.</param>
    public SagaInfo(
        string? className = null,
        string? @namespace = null,
        string? instanceType = null,
        string? stateProperty = null,
        string? contractsNamespace = null,
        string? source = null)
    {
        ClassName = className;
        Namespace = @namespace;
        InstanceType = instanceType;
        StateProperty = stateProperty;
        ContractsNamespace = contractsNamespace;
        Source = source;
    }

    /// <summary>The state machine class (<c>class</c>).</summary>
    public string? ClassName { get; }

    /// <summary>Namespace of the state machine and the saga instance.</summary>
    public string? Namespace { get; }

    /// <summary>The saga instance type (<c>instance</c>).</summary>
    public string? InstanceType { get; }

    /// <summary>The instance property holding the current state.</summary>
    public string? StateProperty { get; }

    /// <summary>Namespace of the message contracts, when not the saga's.</summary>
    public string? ContractsNamespace { get; }

    /// <summary>The C# file that implements the saga, relative to the diagram file, with <c>/</c> as separator.</summary>
    public string? Source { get; }

    internal bool IsEmpty =>
        ClassName is null && Namespace is null && InstanceType is null && StateProperty is null
        && ContractsNamespace is null && Source is null;
}

/// <summary>What is known in code about an event (<c>events[]</c>).</summary>
public sealed class EventInfo
{
    /// <summary>Creates the entry.</summary>
    /// <param name="name">The event, as transitions name it.</param>
    /// <param name="messageType">The message type, when it is not called like the event.</param>
    /// <param name="correlation">The correlation, as written in code.</param>
    public EventInfo(string name, string? messageType = null, string? correlation = null)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        MessageType = messageType;
        Correlation = correlation;
    }

    /// <summary>The event, as transitions name it.</summary>
    public string Name { get; }

    /// <summary>The message type, when it is not called like the event.</summary>
    public string? MessageType { get; }

    /// <summary>The correlation, as written in code.</summary>
    public string? Correlation { get; }
}

/// <summary>What a state does on entry: send a command or publish an event (<c>activities[]</c>).</summary>
public sealed class Activity
{
    /// <summary>Creates the activity.</summary>
    /// <param name="kind">Command or event.</param>
    /// <param name="name">The message, e.g. <c>ChargePayment</c>.</param>
    public Activity(MessageKind kind, string name)
    {
        Kind = kind;
        Name = name ?? throw new ArgumentNullException(nameof(name));
    }

    /// <summary>Send a command or publish an event.</summary>
    public MessageKind Kind { get; }

    /// <summary>The message.</summary>
    public string Name { get; }
}

/// <summary>A request a state makes on entry (<c>requests[]</c>).</summary>
public sealed class Request
{
    /// <summary>Creates the request.</summary>
    /// <param name="name">The request, e.g. <c>ValidateAddress</c>.</param>
    /// <param name="timeout">How long to wait for the reply, free text such as <c>30s</c>.</param>
    public Request(string name, string? timeout = null)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Timeout = timeout;
    }

    /// <summary>The request.</summary>
    public string Name { get; }

    /// <summary>How long to wait for the reply.</summary>
    public string? Timeout { get; }
}

/// <summary>A timeout a state schedules or cancels on entry (<c>timers[]</c>).</summary>
public sealed class Timer
{
    /// <summary>Creates the timer entry.</summary>
    /// <param name="action">Schedule or unschedule.</param>
    /// <param name="name">The timeout message.</param>
    /// <param name="delay">How long until it fires; only with <see cref="TimerAction.Schedule"/>.</param>
    public Timer(TimerAction action, string name, string? delay = null)
    {
        Action = action;
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Delay = delay;
    }

    /// <summary>Schedule or unschedule.</summary>
    public TimerAction Action { get; }

    /// <summary>The timeout message.</summary>
    public string Name { get; }

    /// <summary>How long until it fires.</summary>
    public string? Delay { get; }
}

/// <summary>One step of a routing slip's itinerary (<c>routingSlips[].activities[]</c>).</summary>
public sealed class SlipActivity
{
    /// <summary>Creates the step.</summary>
    /// <param name="name">The activity, e.g. <c>ReserveStock</c>.</param>
    /// <param name="compensates">It is undone when a later activity faults.</param>
    public SlipActivity(string name, bool compensates = false)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Compensates = compensates;
    }

    /// <summary>The activity.</summary>
    public string Name { get; }

    /// <summary>It is undone (compensated) when a later activity faults.</summary>
    public bool Compensates { get; }
}

/// <summary>A routing slip a state starts on entry (<c>routingSlips[]</c>).</summary>
public sealed class RoutingSlip
{
    /// <summary>Creates the routing slip.</summary>
    /// <param name="name">The routing slip, e.g. <c>FulfilOrder</c>.</param>
    /// <param name="activities">The itinerary, in the order the activities run.</param>
    public RoutingSlip(string name, IEnumerable<SlipActivity>? activities = null)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Activities = Lists.Copy(activities);
    }

    /// <summary>The routing slip.</summary>
    public string Name { get; }

    /// <summary>The itinerary.</summary>
    public IReadOnlyList<SlipActivity> Activities { get; }
}

/// <summary>The undo action for the work done to reach a state (<c>compensation</c>).</summary>
public sealed class Compensation
{
    /// <summary>Creates the compensation.</summary>
    /// <param name="name">The undo action.</param>
    /// <param name="description">What it does.</param>
    public Compensation(string name, string? description = null)
    {
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Description = description;
    }

    /// <summary>The undo action.</summary>
    public string Name { get; }

    /// <summary>What it does.</summary>
    public string? Description { get; }
}

/// <summary>A state of the saga (<c>nodes[]</c>).</summary>
public sealed class DiagramNode
{
    /// <summary>Creates the node.</summary>
    /// <param name="id">Unique in the diagram, e.g. <c>state-3</c>.</param>
    /// <param name="type">What the node is.</param>
    /// <param name="name">Label shown on the canvas.</param>
    /// <param name="description">Documentation only.</param>
    /// <param name="color">A palette name or a <c>#rrggbb</c> value.</param>
    /// <param name="activities">What the saga does on entering the state, in order.</param>
    /// <param name="ignores">Events the state receives and drops.</param>
    /// <param name="requests">Requests the state makes on entry.</param>
    /// <param name="routingSlips">Routing slips the state starts on entry.</param>
    /// <param name="timers">Timeouts the state schedules or cancels on entry.</param>
    /// <param name="retry">Free text, documentation only.</param>
    /// <param name="timeout">Free text, documentation only.</param>
    /// <param name="compensation">The undo action for the work done to reach this state.</param>
    public DiagramNode(
        string id,
        NodeType type,
        string name,
        string? description = null,
        string? color = null,
        IEnumerable<Activity>? activities = null,
        IEnumerable<string>? ignores = null,
        IEnumerable<Request>? requests = null,
        IEnumerable<RoutingSlip>? routingSlips = null,
        IEnumerable<Timer>? timers = null,
        string? retry = null,
        string? timeout = null,
        Compensation? compensation = null)
    {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Type = type;
        Name = name ?? throw new ArgumentNullException(nameof(name));
        Description = description;
        Color = color;
        Activities = Lists.Copy(activities);
        Ignores = Lists.Copy(ignores);
        Requests = Lists.Copy(requests);
        RoutingSlips = Lists.Copy(routingSlips);
        Timers = Lists.Copy(timers);
        Retry = retry;
        Timeout = timeout;
        Compensation = compensation;
    }

    /// <summary>Unique in the diagram.</summary>
    public string Id { get; }

    /// <summary>What the node is.</summary>
    public NodeType Type { get; }

    /// <summary>Label shown on the canvas.</summary>
    public string Name { get; }

    /// <summary>Documentation only.</summary>
    public string? Description { get; }

    /// <summary>A palette name or a <c>#rrggbb</c> value.</summary>
    public string? Color { get; }

    /// <summary>What the saga does on entering the state, in order. Only on states.</summary>
    public IReadOnlyList<Activity> Activities { get; }

    /// <summary>Events the state receives and drops. Only on states.</summary>
    public IReadOnlyList<string> Ignores { get; }

    /// <summary>Requests the state makes on entry. Only on states.</summary>
    public IReadOnlyList<Request> Requests { get; }

    /// <summary>Routing slips the state starts on entry. Only on states.</summary>
    public IReadOnlyList<RoutingSlip> RoutingSlips { get; }

    /// <summary>Timeouts the state schedules or cancels on entry. Only on states.</summary>
    public IReadOnlyList<Timer> Timers { get; }

    /// <summary>Free text, documentation only.</summary>
    public string? Retry { get; }

    /// <summary>Free text, documentation only.</summary>
    public string? Timeout { get; }

    /// <summary>The undo action for the work done to reach this state.</summary>
    public Compensation? Compensation { get; }
}

/// <summary>A transition (<c>edges[]</c>).</summary>
public sealed class DiagramEdge
{
    /// <summary>Creates the edge.</summary>
    /// <param name="id">Unique in the diagram, e.g. <c>edge-4</c>.</param>
    /// <param name="source">Id of the state the saga is in.</param>
    /// <param name="target">Id of the state the transition enters.</param>
    /// <param name="kind">Forward or compensation.</param>
    /// <param name="event">The event that triggers the transition.</param>
    /// <param name="eventSource">Where an external event comes from.</param>
    /// <param name="guard">Condition for taking the transition; needs an <paramref name="event"/>.</param>
    public DiagramEdge(
        string id,
        string source,
        string target,
        EdgeKind kind = EdgeKind.Forward,
        string? @event = null,
        string? eventSource = null,
        string? guard = null)
    {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        Source = source ?? throw new ArgumentNullException(nameof(source));
        Target = target ?? throw new ArgumentNullException(nameof(target));
        Kind = kind;
        Event = @event;
        EventSource = eventSource;
        Guard = guard;
    }

    /// <summary>Unique in the diagram.</summary>
    public string Id { get; }

    /// <summary>Id of the state the saga is in.</summary>
    public string Source { get; }

    /// <summary>Id of the state the transition enters.</summary>
    public string Target { get; }

    /// <summary>Forward or compensation.</summary>
    public EdgeKind Kind { get; }

    /// <summary>The event that triggers the transition.</summary>
    public string? Event { get; }

    /// <summary>Where an external event comes from.</summary>
    public string? EventSource { get; }

    /// <summary>Condition for taking the transition.</summary>
    public string? Guard { get; }
}
