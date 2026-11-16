using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GravionLabs.Ariadne.MassTransit.Yaml;

/// <summary>
/// Writes a diagram like <c>serializeDiagram</c> of <c>@ariadne/core</c>: the key order of the specification, block
/// style with two spaces (a list is indented below its key), no line wrapping, LF line ends and a trailing newline.
/// Strings are written by <see cref="YamlScalar"/>.
/// </summary>
internal static class DiagramYamlWriter
{
    internal static string Write(SagaDiagram diagram)
    {
        var root = new Map { { "version", AriadneFormat.Version } };
        root.Add("name", diagram.Name);
        root.Add("description", diagram.Description);
        if (diagram.Saga is { IsEmpty: false } saga)
        {
            var block = new Map();
            block.Add("class", saga.ClassName);
            block.Add("namespace", saga.Namespace);
            block.Add("instance", saga.InstanceType);
            block.Add("stateProperty", saga.StateProperty);
            block.Add("contractsNamespace", saga.ContractsNamespace);
            block.Add("source", saga.Source);
            root.Add("saga", block);
        }

        if (diagram.Events.Count > 0)
        {
            var events = new List<object>();
            foreach (var e in diagram.Events)
            {
                var entry = new Map();
                entry.Add("name", e.Name);
                entry.Add("messageType", e.MessageType);
                entry.Add("correlation", e.Correlation);
                events.Add(entry);
            }

            root.Add("events", events);
        }

        root.Add("direction", DiagramNames.Of(diagram.Direction));
        if (diagram.Spacing is { } spacing && spacing != Spacing.Normal)
        {
            root.Add("spacing", DiagramNames.Of(spacing));
        }

        var nodes = new List<object>();
        foreach (var node in diagram.Nodes)
        {
            nodes.Add(NodeMap(node));
        }

        root.Add("nodes", nodes);
        var edges = new List<object>();
        foreach (var edge in diagram.Edges)
        {
            var entry = new Map();
            entry.Add("id", edge.Id);
            entry.Add("source", edge.Source);
            entry.Add("target", edge.Target);
            entry.Add("kind", DiagramNames.Of(edge.Kind));
            entry.Add("event", edge.Event);
            entry.Add("eventSource", edge.EventSource);
            entry.Add("guard", edge.Guard);
            edges.Add(entry);
        }

        root.Add("edges", edges);

        var sb = new StringBuilder();
        Emit(sb, root, 0, firstInline: false);
        return sb.ToString();
    }

    private static Map NodeMap(DiagramNode node)
    {
        var map = new Map();
        map.Add("id", node.Id);
        map.Add("type", DiagramNames.Of(node.Type));
        map.Add("name", node.Name);
        map.Add("description", node.Description);
        map.Add("color", node.Color);
        if (node.Activities.Count > 0)
        {
            var list = new List<object>();
            foreach (var a in node.Activities)
            {
                list.Add(new Map { { DiagramNames.Of(a.Kind), a.Name } });
            }

            map.Add("activities", list);
        }

        if (node.Ignores.Count > 0)
        {
            map.Add("ignores", new List<object>(node.Ignores));
        }

        if (node.Requests.Count > 0)
        {
            var list = new List<object>();
            foreach (var r in node.Requests)
            {
                var entry = new Map { { "request", r.Name } };
                entry.Add("timeout", r.Timeout);
                list.Add(entry);
            }

            map.Add("requests", list);
        }

        if (node.RoutingSlips.Count > 0)
        {
            var list = new List<object>();
            foreach (var slip in node.RoutingSlips)
            {
                var activities = new List<object>();
                foreach (var a in slip.Activities)
                {
                    var entry = new Map { { "activity", a.Name } };
                    if (a.Compensates)
                    {
                        entry.Add("compensates", true);
                    }

                    activities.Add(entry);
                }

                list.Add(new Map { { "routingSlip", slip.Name }, { "activities", activities } });
            }

            map.Add("routingSlips", list);
        }

        if (node.Timers.Count > 0)
        {
            var list = new List<object>();
            foreach (var t in node.Timers)
            {
                var entry = new Map { { DiagramNames.Of(t.Action), t.Name } };
                entry.Add("delay", t.Delay);
                list.Add(entry);
            }

            map.Add("timers", list);
        }

        map.Add("retry", node.Retry);
        map.Add("timeout", node.Timeout);
        if (node.Compensation is { } compensation)
        {
            var entry = new Map { { "name", compensation.Name } };
            entry.Add("description", compensation.Description);
            map.Add("compensation", entry);
        }

        return map;
    }

    /// <summary>Writes a mapping or a list at the column <paramref name="column"/>.</summary>
    private static void Emit(StringBuilder sb, object value, int column, bool firstInline)
    {
        if (value is Map map)
        {
            for (var i = 0; i < map.Count; i++)
            {
                if (i > 0 || !firstInline)
                {
                    sb.Append(' ', column);
                }

                sb.Append(map[i].Key).Append(':');
                EmitValue(sb, map[i].Value, column);
            }
        }
        else
        {
            foreach (var item in (List<object>)value)
            {
                sb.Append(' ', column).Append("- ");
                if (item is Map { Count: > 0 } entry)
                {
                    Emit(sb, entry, column + 2, firstInline: true);
                }
                else
                {
                    sb.Append(Scalar(item, column + 2)).Append('\n');
                }
            }
        }
    }

    private static void EmitValue(StringBuilder sb, object value, int column)
    {
        switch (value)
        {
            case Map { Count: > 0 } child:
                sb.Append('\n');
                Emit(sb, child, column + 2, firstInline: false);
                break;
            case Map:
                sb.Append(" {}\n");
                break;
            case List<object> { Count: > 0 } list:
                sb.Append('\n');
                Emit(sb, list, column + 2, firstInline: false);
                break;
            case List<object>:
                sb.Append(" []\n");
                break;
            default:
                sb.Append(' ').Append(Scalar(value, column + 2)).Append('\n');
                break;
        }
    }

    private static string Scalar(object value, int indent)
    {
        return value switch
        {
            string text => YamlScalar.Write(text, new string(' ', indent)),
            bool flag => flag ? "true" : "false",
            int number => number.ToString(CultureInfo.InvariantCulture),
            Map => "{}",
            _ => "[]",
        };
    }

    /// <summary>A mapping in key order; a <see langword="null"/> value is not written.</summary>
    private sealed class Map : IEnumerable<KeyValuePair<string, object>>
    {
        private readonly List<KeyValuePair<string, object>> _pairs = new();

        internal int Count => _pairs.Count;

        internal KeyValuePair<string, object> this[int index] => _pairs[index];

        public void Add(string key, object? value)
        {
            if (value is not null)
            {
                _pairs.Add(new KeyValuePair<string, object>(key, value));
            }
        }

        public IEnumerator<KeyValuePair<string, object>> GetEnumerator() => _pairs.GetEnumerator();

        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
