using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
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

/// <summary>What a state does on entry that the format can show.</summary>
internal enum ItemKind
{
    /// <summary><c>Send</c>.</summary>
    Command,

    /// <summary><c>Publish</c>.</summary>
    Event,

    /// <summary><c>Request</c>.</summary>
    Request,

    /// <summary><c>Schedule</c>.</summary>
    Schedule,

    /// <summary><c>Unschedule</c>.</summary>
    Unschedule,
}

/// <summary>A <c>Send</c>, <c>Publish</c>, <c>Request</c>, <c>Schedule</c> or <c>Unschedule</c> found in a behavior.</summary>
internal sealed class ItemRecord
{
    internal ItemRecord(ItemKind kind, string name, string? detail = null)
    {
        Kind = kind;
        Name = name;
        Detail = detail;
    }

    internal ItemKind Kind { get; }

    /// <summary>The message type, or the name of the request or the schedule.</summary>
    internal string Name { get; }

    /// <summary>The timeout of a request or the delay of a schedule, as the format writes it.</summary>
    internal string? Detail { get; }
}

/// <summary>
/// A part of the behavior of an event: the behavior itself, or one branch of an <c>If</c>. The items of a scope and of
/// every scope around it happen on a transition in it, wherever in the code they are written, as the importer reads it.
/// </summary>
internal sealed class BranchScope
{
    internal BranchScope(BranchScope? parent, string? guard)
    {
        Parent = parent;
        Guard = guard;
    }

    internal BranchScope? Parent { get; }

    /// <summary>The guard of the branch, or <see langword="null"/> for the behavior itself.</summary>
    internal string? Guard { get; }

    internal List<ItemRecord> Items { get; } = new List<ItemRecord>();

    /// <summary>How often a condition was met in this scope: every condition is visited twice, for its then and its else.</summary>
    internal int ConditionVisits { get; set; }

    /// <summary>The items of the outer scopes first, then those of this one.</summary>
    internal IEnumerable<ItemRecord> ItemsOnTheWay()
    {
        if (Parent is not null)
        {
            foreach (var item in Parent.ItemsOnTheWay())
            {
                yield return item;
            }
        }

        foreach (var item in Items)
        {
            yield return item;
        }
    }
}

/// <summary>A <c>TransitionTo</c> or <c>Finalize</c> found in the behavior of an event.</summary>
internal sealed class TransitionRecord
{
    internal TransitionRecord(string target, string? guard, bool caught, BranchScope scope)
    {
        Target = target;
        Guard = guard;
        Caught = caught;
        Scope = scope;
    }

    internal string Target { get; }

    /// <summary>It sits in a branch of <c>If</c>, <c>IfElse</c> or <c>When(E, filter)</c>, or follows an <c>If</c>.</summary>
    internal bool Guarded => Guard is not null;

    /// <summary>The guard: what the runtime offers, see <see cref="DiagramBuilder.UnreadableGuard"/>.</summary>
    internal string? Guard { get; }

    /// <summary>What happens on the way to the target.</summary>
    internal BranchScope Scope { get; }

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

    /// <summary>The behavior itself: its items are those of the handler as a whole.</summary>
    internal BranchScope Root { get; } = new BranchScope(null, null);

    /// <summary>What could not be read, as construct and message.</summary>
    internal List<(string Construct, string Message)> Problems { get; } = new List<(string, string)>();

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
    private int _catches;
    private BranchScope? _scope;

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
        _catches = 0;
        if (_state is null)
        {
            _current = null;
            _scope = null;
            return;
        }

        _current = new HandlerRecord(_state, DiagramName(eventName), messageType, RoleOf(eventName));
        _scope = _current.Root;
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

        var scope = _scope ?? handler.Root;
        switch (name)
        {
            case "TransitionActivity`1":
                if (activity.GetType().GetProperty("ToState")?.GetValue(activity) is State to)
                {
                    handler.Transitions.Add(new TransitionRecord(to.Name, GuardOf(scope), _catches > 0, scope));
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
                var visit = scope.ConditionVisits++;
                var branch = new BranchScope(scope, visit % 2 == 0 ? DiagramBuilder.UnreadableGuard : "!(" + DiagramBuilder.UnreadableGuard + ")");
                _scope = branch;
                try
                {
                    next?.Invoke(activity);
                }
                finally
                {
                    _scope = scope;
                }

                return;
            case "CatchFaultActivity`2":
            case "CatchFaultActivity`1":
                handler.HasCatch = true;
                Nested(ref _catches, activity, next);
                return;
            default:
                if (_catches == 0)
                {
                    Record(handler, scope, activity, name);
                }

                break;
        }

        next?.Invoke(activity);
    }

    /// <summary>
    /// The guard of a transition. In a branch it is the branch's. After an <c>If</c> it is the way out when no condition
    /// holds: the negation of its condition, or <c>otherwise</c> after several.
    /// </summary>
    private static string? GuardOf(BranchScope scope)
    {
        if (scope.ConditionVisits >= 4)
        {
            return "otherwise";
        }

        if (scope.ConditionVisits >= 2)
        {
            return "!(" + DiagramBuilder.UnreadableGuard + ")";
        }

        return scope.Guard;
    }

    private static void Record(HandlerRecord handler, BranchScope scope, IStateMachineActivity activity, string name)
    {
        var type = activity.GetType();
        if (name.StartsWith("SendActivity`", StringComparison.Ordinal) || name.StartsWith("PublishActivity`", StringComparison.Ordinal))
        {
            var message = type.GetGenericArguments()[type.GetGenericArguments().Length - 1];
            scope.Items.Add(new ItemRecord(name[0] == 'S' ? ItemKind.Command : ItemKind.Event, DiagramBuilder.TypeName(message)));
        }
        else if (name.StartsWith("RequestActivity`", StringComparison.Ordinal))
        {
            var request = Reflect.Field(activity, "_request");
            var requestName = Reflect.Property(request, "Name") as string;
            if (requestName is null)
            {
                handler.Problems.Add(("Request", "The request could not be read from the built state machine: left out."));
                return;
            }

            var timeout = Reflect.Property(Reflect.Property(request, "Settings"), "Timeout") is TimeSpan span && span > TimeSpan.Zero
                ? Duration.Text(span)
                : null;
            scope.Items.Add(new ItemRecord(ItemKind.Request, requestName, timeout));
        }
        else if (name.StartsWith("ScheduleActivity`", StringComparison.Ordinal))
        {
            var schedule = Reflect.Field(activity, "_schedule");
            var scheduleName = Reflect.Field(schedule, "_name") as string;
            if (scheduleName is null)
            {
                handler.Problems.Add(("Schedule", "The schedule could not be read from the built state machine: left out."));
                return;
            }

            var delay = ConstantDelay(activity, schedule);
            if (delay is null)
            {
                handler.Problems.Add(("Schedule", "The delay of " + scheduleName + " is not a constant (or could not be read): left out."));
            }

            scope.Items.Add(new ItemRecord(ItemKind.Schedule, scheduleName, delay));
        }
        else if (name.StartsWith("UnscheduleActivity`", StringComparison.Ordinal))
        {
            if (Reflect.Field(Reflect.Field(activity, "_schedule"), "_name") is string scheduleName)
            {
                scope.Items.Add(new ItemRecord(ItemKind.Unschedule, scheduleName));
            }
            else
            {
                handler.Problems.Add(("Unschedule", "The schedule could not be read from the built state machine: left out."));
            }
        }
    }

    /// <summary>
    /// The delay of a schedule when it is a constant: <c>s.Delay = …</c> in the configuration of the schedule, used by
    /// <c>Schedule(schedule, message)</c>. <c>Schedule(schedule, message, delayProvider)</c> keeps a delegate in the activity: not a constant.
    /// </summary>
    private static string? ConstantDelay(IStateMachineActivity activity, object? schedule)
    {
        if (Reflect.Field(activity, "_timeProvider") is not Delegate provider || provider.Target is null)
        {
            return null;
        }

        const BindingFlags all = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
        if (provider.Target.GetType().GetFields(all).Any(f => typeof(Delegate).IsAssignableFrom(f.FieldType)))
        {
            return null;
        }

        var settings = Reflect.Field(schedule, "_settings");
        if (Reflect.Property(settings, "DelayProvider") is not Delegate delay || !delay.Method.Name.StartsWith("<set_Delay>", StringComparison.Ordinal))
        {
            return null;
        }

        try
        {
            return delay.DynamicInvoke(new object?[] { null }) is TimeSpan span && span > TimeSpan.Zero ? Duration.Text(span) : null;
        }
#pragma warning disable CA1031 // A delay that cannot be evaluated is reported as a warning, never thrown.
        catch (Exception)
#pragma warning restore CA1031
        {
            return null;
        }
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
