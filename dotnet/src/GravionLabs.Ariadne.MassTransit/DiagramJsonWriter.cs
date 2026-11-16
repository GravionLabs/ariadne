using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// Writes a diagram like <c>JSON.stringify(file, null, 2)</c> of <c>@ariadne/core</c>: the key order of the
/// specification, one property per line, <c>[]</c> for an empty array, and the escaping of JavaScript (the quote,
/// the backslash and control characters only; everything else as it is). Written by hand because the escaper of
/// System.Text.Json differs (it escapes more, and writes hex digits in upper case).
/// </summary>
internal static class DiagramJsonWriter
{
    internal static string Write(SagaDiagram diagram, bool indented)
    {
        var w = new Text(indented);
        w.BeginObject();
        w.Number("version", AriadneFormat.Version);
        w.Str("name", diagram.Name);
        w.Str("description", diagram.Description);
        if (diagram.Saga is { IsEmpty: false } saga)
        {
            w.Key("saga");
            w.BeginObject();
            w.Str("class", saga.ClassName);
            w.Str("namespace", saga.Namespace);
            w.Str("instance", saga.InstanceType);
            w.Str("stateProperty", saga.StateProperty);
            w.Str("contractsNamespace", saga.ContractsNamespace);
            w.Str("source", saga.Source);
            w.EndObject();
        }

        if (diagram.Events.Count > 0)
        {
            w.Key("events");
            w.BeginArray();
            foreach (var e in diagram.Events)
            {
                w.BeginObject();
                w.Str("name", e.Name);
                w.Str("messageType", e.MessageType);
                w.Str("correlation", e.Correlation);
                w.EndObject();
            }

            w.EndArray();
        }

        w.Str("direction", DiagramNames.Of(diagram.Direction));
        if (diagram.Spacing is { } spacing && spacing != Spacing.Normal)
        {
            w.Str("spacing", DiagramNames.Of(spacing));
        }

        w.Key("nodes");
        w.BeginArray();
        foreach (var node in diagram.Nodes)
        {
            WriteNode(w, node);
        }

        w.EndArray();
        w.Key("edges");
        w.BeginArray();
        foreach (var edge in diagram.Edges)
        {
            w.BeginObject();
            w.Str("id", edge.Id);
            w.Str("source", edge.Source);
            w.Str("target", edge.Target);
            w.Str("kind", DiagramNames.Of(edge.Kind));
            w.Str("event", edge.Event);
            w.Str("eventSource", edge.EventSource);
            w.Str("guard", edge.Guard);
            w.EndObject();
        }

        w.EndArray();
        w.EndObject();
        return w.ToString();
    }

    private static void WriteNode(Text w, DiagramNode node)
    {
        w.BeginObject();
        w.Str("id", node.Id);
        w.Str("type", DiagramNames.Of(node.Type));
        w.Str("name", node.Name);
        w.Str("description", node.Description);
        w.Str("color", node.Color);
        if (node.Activities.Count > 0)
        {
            w.Key("activities");
            w.BeginArray();
            foreach (var a in node.Activities)
            {
                w.BeginObject();
                w.Str(DiagramNames.Of(a.Kind), a.Name);
                w.EndObject();
            }

            w.EndArray();
        }

        if (node.Ignores.Count > 0)
        {
            w.Key("ignores");
            w.BeginArray();
            foreach (var ignore in node.Ignores)
            {
                w.Value(ignore);
            }

            w.EndArray();
        }

        if (node.Requests.Count > 0)
        {
            w.Key("requests");
            w.BeginArray();
            foreach (var r in node.Requests)
            {
                w.BeginObject();
                w.Str("request", r.Name);
                w.Str("timeout", r.Timeout);
                w.EndObject();
            }

            w.EndArray();
        }

        if (node.RoutingSlips.Count > 0)
        {
            w.Key("routingSlips");
            w.BeginArray();
            foreach (var slip in node.RoutingSlips)
            {
                w.BeginObject();
                w.Str("routingSlip", slip.Name);
                w.Key("activities");
                w.BeginArray();
                foreach (var a in slip.Activities)
                {
                    w.BeginObject();
                    w.Str("activity", a.Name);
                    if (a.Compensates)
                    {
                        w.Key("compensates");
                        w.Raw("true");
                    }

                    w.EndObject();
                }

                w.EndArray();
                w.EndObject();
            }

            w.EndArray();
        }

        if (node.Timers.Count > 0)
        {
            w.Key("timers");
            w.BeginArray();
            foreach (var t in node.Timers)
            {
                w.BeginObject();
                w.Str(DiagramNames.Of(t.Action), t.Name);
                w.Str("delay", t.Delay);
                w.EndObject();
            }

            w.EndArray();
        }

        w.Str("retry", node.Retry);
        w.Str("timeout", node.Timeout);
        if (node.Compensation is { } compensation)
        {
            w.Key("compensation");
            w.BeginObject();
            w.Str("name", compensation.Name);
            w.Str("description", compensation.Description);
            w.EndObject();
        }

        w.EndObject();
    }

    /// <summary>A JSON text builder that tracks commas and indentation.</summary>
    private sealed class Text
    {
        private const int IndentSize = 2;
        private readonly StringBuilder _sb = new();
        private readonly bool _indented;
        private readonly List<bool> _hasItems = new();
        private bool _afterKey;

        internal Text(bool indented) => _indented = indented;

        public override string ToString() => _sb.ToString();

        internal void BeginObject() => Begin('{');

        internal void EndObject() => End('}');

        internal void BeginArray() => Begin('[');

        internal void EndArray() => End(']');

        internal void Key(string name)
        {
            Item();
            Quote(name);
            _sb.Append(_indented ? ": " : ":");
            _afterKey = true;
        }

        /// <summary>A string property; nothing is written for <see langword="null"/>.</summary>
        internal void Str(string name, string? value)
        {
            if (value is null)
            {
                return;
            }

            Key(name);
            Value(value);
        }

        internal void Number(string name, int value)
        {
            Key(name);
            Raw(value.ToString(CultureInfo.InvariantCulture));
        }

        internal void Value(string value)
        {
            Item();
            Quote(value);
        }

        internal void Raw(string literal)
        {
            Item();
            _sb.Append(literal);
        }

        private void Begin(char open)
        {
            Item();
            _sb.Append(open);
            _hasItems.Add(false);
        }

        private void End(char close)
        {
            var had = _hasItems[_hasItems.Count - 1];
            _hasItems.RemoveAt(_hasItems.Count - 1);
            if (had)
            {
                NewLine();
            }

            _sb.Append(close);
        }

        /// <summary>Called before every value or key: the comma and the line break of the position.</summary>
        private void Item()
        {
            if (_afterKey)
            {
                _afterKey = false;
                return;
            }

            if (_hasItems.Count == 0)
            {
                return;
            }

            if (_hasItems[_hasItems.Count - 1])
            {
                _sb.Append(',');
            }

            _hasItems[_hasItems.Count - 1] = true;
            NewLine();
        }

        private void NewLine()
        {
            if (!_indented)
            {
                return;
            }

            _sb.Append('\n').Append(' ', _hasItems.Count * IndentSize);
        }

        /// <summary>The string as <c>JSON.stringify</c> writes it, lone surrogates included.</summary>
        private void Quote(string value)
        {
            _sb.Append('"');
            for (var i = 0; i < value.Length; i++)
            {
                var c = value[i];
                switch (c)
                {
                    case '"': _sb.Append("\\\""); break;
                    case '\\': _sb.Append("\\\\"); break;
                    case '\b': _sb.Append("\\b"); break;
                    case '\f': _sb.Append("\\f"); break;
                    case '\n': _sb.Append("\\n"); break;
                    case '\r': _sb.Append("\\r"); break;
                    case '\t': _sb.Append("\\t"); break;
                    default:
                        if (c < ' ' || (char.IsSurrogate(c) && !IsPairedSurrogate(value, i)))
                        {
                            _sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            _sb.Append(c);
                        }

                        break;
                }
            }

            _sb.Append('"');
        }

        private static bool IsPairedSurrogate(string value, int i)
        {
            return char.IsHighSurrogate(value[i])
                ? i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])
                : i > 0 && char.IsHighSurrogate(value[i - 1]);
        }
    }
}
