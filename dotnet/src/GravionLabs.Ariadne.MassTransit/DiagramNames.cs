namespace GravionLabs.Ariadne.MassTransit;

/// <summary>The spelling of the enum values in the document.</summary>
internal static class DiagramNames
{
    internal static readonly string[] NodeTypes = { "start", "end", "state", "any", "join" };
    internal static readonly string[] EdgeKinds = { "forward", "compensation" };
    internal static readonly string[] Directions = { "top-bottom", "bottom-top", "left-right", "right-left" };
    internal static readonly string[] Spacings = { "compact", "normal", "spacious" };

    internal static string Of(NodeType value) => NodeTypes[(int)value];

    internal static string Of(EdgeKind value) => EdgeKinds[(int)value];

    internal static string Of(Direction value) => Directions[(int)value];

    internal static string Of(Spacing value) => Spacings[(int)value];

    internal static string Of(MessageKind value) => value == MessageKind.Command ? "command" : "event";

    internal static string Of(TimerAction value) => value == TimerAction.Schedule ? "schedule" : "unschedule";
}
