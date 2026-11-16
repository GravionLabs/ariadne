using System;
using System.Collections.Generic;
using MassTransit;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>Where an event of a state comes from.</summary>
internal enum HandlerRole
{
    /// <summary>An event the saga reacts to.</summary>
    Normal,

    /// <summary><c>WhenEnter</c> (<c>&lt;State&gt;.Enter</c>).</summary>
    Enter,

    /// <summary><c>WhenLeave</c>.</summary>
    Leave,

    /// <summary><c>BeforeEnter</c>.</summary>
    BeforeEnter,

    /// <summary><c>AfterLeave</c>.</summary>
    AfterLeave,

    /// <summary>Bookkeeping MassTransit adds itself (<c>&lt;Schedule&gt;.AnyReceived</c>); not part of the saga.</summary>
    Internal,
}

/// <summary>A <c>TransitionTo</c> or <c>Finalize</c> found in the behavior of an event.</summary>
internal sealed class TransitionRecord
{
    internal TransitionRecord(string target, bool guarded, bool caught)
    {
        Target = target;
        Guarded = guarded;
        Caught = caught;
    }

    internal string Target { get; }

    /// <summary>It sits in a branch of <c>If</c>, <c>IfElse</c> or <c>When(E, filter)</c>.</summary>
    internal bool Guarded { get; }

    /// <summary>It sits in a <c>Catch</c> or <c>Fault</c>.</summary>
    internal bool Caught { get; }
}

/// <summary>What one state does on one event.</summary>
internal sealed class HandlerRecord
{
    internal HandlerRecord(string state, string eventName, Type? messageType, HandlerRole role)
    {
        State = state;
        EventName = eventName;
        MessageType = messageType;
        Role = role;
    }

    internal string State { get; }

    internal string EventName { get; }

    internal Type? MessageType { get; }

    internal HandlerRole Role { get; }

    internal List<TransitionRecord> Transitions { get; } = new List<TransitionRecord>();

    /// <summary>The handler has a <c>CompositeEvent</c> member activity.</summary>
    internal bool IsCompositeMember { get; set; }

    /// <summary>The handler runs <c>Then</c> / <c>ThenAsync</c> code.</summary>
    internal bool RunsCode { get; set; }

    /// <summary>The handler has a condition (<c>If</c>, <c>IfElse</c>, <c>When(E, filter)</c>).</summary>
    internal bool HasCondition { get; set; }

    /// <summary>The handler has a <c>Catch</c> or <c>Fault</c>.</summary>
    internal bool HasCatch { get; set; }
}

/// <summary>
/// Walks a built state machine with the visitor of MassTransit (<c>machine.Accept</c>), the interface the spike
/// (docs/specs/masstransit-introspection.md) recommends, and records every event of every state with the transitions
/// of its behavior. The activity types are generic and partly internal, so they are told apart by name.
/// </summary>
internal sealed class HandlerCollector : StateMachineVisitor
{
    private string? _state;
    private HandlerRecord? _current;
    private int _conditions;
    private int _catches;

    internal List<HandlerRecord> Handlers { get; } = new List<HandlerRecord>();

    /// <summary>The names of the states in the order the visitor met them.</summary>
    internal List<string> States { get; } = new List<string>();

    public void Visit(State state, Action<State> next)
    {
        _state = state.Name;
        _current = null;
        States.Add(state.Name);
        next(state);
    }

    public void Visit(Event @event, Action<Event> next)
    {
        Begin(@event.Name, null);
        next(@event);
    }

    public void Visit<TMessage>(Event<TMessage> @event, Action<Event<TMessage>> next)
        where TMessage : class
    {
        Begin(@event.Name, typeof(TMessage));
        next(@event);
    }

    public void Visit(IStateMachineActivity activity) => Inspect(activity, null);

    public void Visit(IStateMachineActivity activity, Action<IStateMachineActivity> next) => Inspect(activity, next);

    public void Visit<T>(IBehavior<T> behavior)
        where T : class, SagaStateMachineInstance
    {
    }

    public void Visit<T>(IBehavior<T> behavior, Action<IBehavior<T>> next)
        where T : class, SagaStateMachineInstance => next(behavior);

    public void Visit<T, TMessage>(IBehavior<T, TMessage> behavior)
        where T : class, SagaStateMachineInstance
        where TMessage : class
    {
    }

    public void Visit<T, TMessage>(IBehavior<T, TMessage> behavior, Action<IBehavior<T, TMessage>> next)
        where T : class, SagaStateMachineInstance
        where TMessage : class => next(behavior);

    internal static HandlerRole RoleOf(string eventName)
    {
        if (eventName.EndsWith(".Enter", StringComparison.Ordinal))
        {
            return HandlerRole.Enter;
        }

        if (eventName.EndsWith(".Leave", StringComparison.Ordinal))
        {
            return HandlerRole.Leave;
        }

        if (eventName.EndsWith(".BeforeEnter", StringComparison.Ordinal))
        {
            return HandlerRole.BeforeEnter;
        }

        if (eventName.EndsWith(".AfterLeave", StringComparison.Ordinal))
        {
            return HandlerRole.AfterLeave;
        }

        return eventName.EndsWith(".AnyReceived", StringComparison.Ordinal) ? HandlerRole.Internal : HandlerRole.Normal;
    }

    /// <summary>
    /// The name of an event in the diagram. It is the name MassTransit gives it, except that the event of a schedule
    /// (<c>Reminder.Received</c>) is shown as the schedule (<c>Reminder</c>), as the importer shows it.
    /// </summary>
    internal static string DiagramName(string eventName) =>
        eventName.EndsWith(".Received", StringComparison.Ordinal) ? eventName.Substring(0, eventName.Length - ".Received".Length) : eventName;

    private void Begin(string eventName, Type? messageType)
    {
        _conditions = 0;
        _catches = 0;
        if (_state is null)
        {
            _current = null;
            return;
        }

        _current = new HandlerRecord(_state, DiagramName(eventName), messageType, RoleOf(eventName));
        Handlers.Add(_current);
    }

    private void Inspect(IStateMachineActivity activity, Action<IStateMachineActivity>? next)
    {
        var handler = _current;
        var name = activity.GetType().Name;
        if (handler is null)
        {
            next?.Invoke(activity);
            return;
        }

        switch (name)
        {
            case "TransitionActivity`1":
                if (activity.GetType().GetProperty("ToState")?.GetValue(activity) is State to)
                {
                    handler.Transitions.Add(new TransitionRecord(to.Name, _conditions > 0, _catches > 0));
                }

                break;
            case "CompositeEventActivity`1":
                handler.IsCompositeMember = true;
                break;
            case "ActionActivity`1":
            case "ActionActivity`2":
            case "AsyncActivity`1":
            case "AsyncActivity`2":
                handler.RunsCode = true;
                break;
            case "ConditionActivity`2":
            case "ConditionActivity`1":
                handler.HasCondition = true;
                Nested(ref _conditions, activity, next);
                return;
            case "CatchFaultActivity`2":
            case "CatchFaultActivity`1":
                handler.HasCatch = true;
                Nested(ref _catches, activity, next);
                return;
            default:
                break;
        }

        next?.Invoke(activity);
    }

    private static void Nested(ref int depth, IStateMachineActivity activity, Action<IStateMachineActivity>? next)
    {
        depth++;
        try
        {
            next?.Invoke(activity);
        }
        finally
        {
            depth--;
        }
    }
}
