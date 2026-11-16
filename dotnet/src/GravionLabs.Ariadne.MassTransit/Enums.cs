namespace GravionLabs.Ariadne.MassTransit;

/// <summary>What a node is (<c>nodes[].type</c>).</summary>
public enum NodeType
{
    /// <summary>The initial state: nothing enters it.</summary>
    Start,

    /// <summary>A final state: nothing leaves it.</summary>
    End,

    /// <summary>A state.</summary>
    State,

    /// <summary>The transitions leaving it apply in every state (<c>DuringAny</c>).</summary>
    Any,

    /// <summary>Waits until the events of all incoming transitions have arrived (<c>CompositeEvent</c>).</summary>
    Join,
}

/// <summary>The kind of a transition (<c>edges[].kind</c>).</summary>
public enum EdgeKind
{
    /// <summary>A normal transition.</summary>
    Forward,

    /// <summary>A compensation transition; it is not laid out.</summary>
    Compensation,
}

/// <summary>Which way the flow runs, from the initial state on (<c>direction</c>).</summary>
public enum Direction
{
    /// <summary>Down (the default).</summary>
    TopBottom,

    /// <summary>Up.</summary>
    BottomTop,

    /// <summary>To the right.</summary>
    LeftRight,

    /// <summary>To the left.</summary>
    RightLeft,
}

/// <summary>Room between states and between layers (<c>spacing</c>).</summary>
public enum Spacing
{
    /// <summary>Less room.</summary>
    Compact,

    /// <summary>The default; it is not written.</summary>
    Normal,

    /// <summary>More room.</summary>
    Spacious,
}

/// <summary>What a state activity sends.</summary>
public enum MessageKind
{
    /// <summary>A command, sent to exactly one consumer.</summary>
    Command,

    /// <summary>An event, published to all subscribers.</summary>
    Event,
}

/// <summary>What a timer entry of a state does.</summary>
public enum TimerAction
{
    /// <summary>Schedules a timeout.</summary>
    Schedule,

    /// <summary>Cancels a scheduled timeout.</summary>
    Unschedule,
}
