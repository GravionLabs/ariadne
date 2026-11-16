using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

/// <summary>Diagrams whose strings are the ones a YAML writer gets wrong, generated from a seed.</summary>
internal sealed class AwkwardDiagrams
{
    private static readonly string[] Words =
    {
        "yes", "no", "on", "off", "null", "Null", "NULL", "~", "true", "True", "FALSE", "1e3", "1E-3", "0x10", "0o7", "0b1", ".inf", "-.inf",
        ".nan", "+1", "-1", "1.", ".5", "12:30:45", "2026-10-04", "1_000", "-", "?", "- a", "? a", "[a, b]", "{a: b}", "*alias", "&anchor",
        "!tag", "|", ">", "%YAML", "---", "...", "\"quoted\"", "'single'", "it's", "say \"hi\"", "both ' and \"", "a: b", "a:b", "a #b", "a#b",
        "#start", "end:", "end ", " lead", "\ttab", "a\tb", "a  b", ",", "@x", "`x`", "key: value: more", "http://x.y/z?q=1#f", "\\", "a\\nb",
        "Größe", "日本語", "😀 emoji", "é", "\u00a0nbsp", "\u2028sep", "\u0085nel", "\u007f", "\u0001ctl", "\u0000", "\r", "a\r\nb",
        "line1\nline2", "line1\n\nline2", "\nlead newline", "trail newline\n", "trail two\n\n", "  indented\nline", "line\n  indented", "a \nb", "a\n b",
        "\n", "\n\n", " ", "  ", "x\n ", "x\n\t", "x\n#c", "#\nx", "a: b\nc: d", "- a\n- b", "---\nx", "x\n---", "...\nx", "%a\nb",
        "A long description that goes on and on and on, past the eighty columns a folding writer would wrap at, with \"quotes\" and: colons.",
        "tab\there\nand a break",
    };

    private readonly Random _random;

    private readonly bool _whitespaceOnly;

    /// <param name="seed">The seed of the generator.</param>
    /// <param name="whitespaceOnly">Whether strings of whitespace only are generated; a YAML reader may read those back differently (a block of nothing but blanks has no indent to find).</param>
    internal AwkwardDiagrams(int seed, bool whitespaceOnly)
    {
        _random = new Random(seed);
        _whitespaceOnly = whitespaceOnly;
    }

    /// <summary>A string that is not empty and has a visible character, for the fields that must be.</summary>
    private string Required() => Text(required: true);

    private string? Optional() => _random.Next(3) == 0 ? null : Text(required: false);

    private string Text(bool required)
    {
        var sb = new StringBuilder();
        var parts = 1 + _random.Next(3);
        for (var i = 0; i < parts; i++)
        {
            if (i > 0)
            {
                sb.Append(_random.Next(2) == 0 ? " " : "\n");
            }

            sb.Append(_random.Next(4) == 0 ? RandomUnicode() : Words[_random.Next(Words.Length)]);
        }

        var text = sb.ToString();
        return (required || !_whitespaceOnly) && string.IsNullOrWhiteSpace(text) ? text + "x" : text;
    }

    private string RandomUnicode()
    {
        var sb = new StringBuilder();
        for (var i = _random.Next(1, 8); i > 0; i--)
        {
            var code = _random.Next(0x20, 0x2FFF);
            if (code is >= 0xD800 and <= 0xDFFF)
            {
                continue;
            }

            sb.Append((char)code);
        }

        return sb.ToString();
    }

    internal SagaDiagram Next()
    {
        var nodes = new List<DiagramNode> { new("start-1", NodeType.Start, Required()) };
        var stateCount = _random.Next(1, 5);
        for (var i = 0; i < stateCount; i++)
        {
            nodes.Add(State($"state-{i}"));
        }

        nodes.Add(new DiagramNode("end-1", NodeType.End, Required(), Optional()));
        if (_random.Next(2) == 0)
        {
            nodes.Add(new DiagramNode("any-1", NodeType.Any, Required()));
        }

        var edges = new List<DiagramEdge>();
        for (var i = 0; i < _random.Next(0, 6); i++)
        {
            var @event = Optional();
            edges.Add(new DiagramEdge(
                $"edge-{i + 1}",
                nodes[_random.Next(nodes.Count)].Id,
                nodes[_random.Next(nodes.Count)].Id,
                _random.Next(4) == 0 ? EdgeKind.Compensation : EdgeKind.Forward,
                @event,
                Optional(),
                @event is null ? null : Optional()));
        }

        var events = new List<EventInfo>();
        for (var i = 0; i < _random.Next(0, 3); i++)
        {
            events.Add(new EventInfo($"Event{i}" + Required(), Optional(), Optional()));
        }

        return new SagaDiagram(
            nodes,
            edges,
            Optional(),
            Optional(),
            _random.Next(2) == 0 ? new SagaInfo(Optional(), Optional(), Optional(), Optional(), Optional(), Optional()) : null,
            events,
            (Direction)_random.Next(4),
            (Spacing)_random.Next(3));
    }

    private DiagramNode State(string id)
    {
        var activities = Enumerable.Range(0, _random.Next(3))
            .Select(_ => new Activity(_random.Next(2) == 0 ? MessageKind.Command : MessageKind.Event, Required()));
        var ignores = Enumerable.Range(0, _random.Next(3)).Select(_ => Required());
        var requests = Enumerable.Range(0, _random.Next(3)).Select(_ => new Request(Required(), Optional()));
        var slips = Enumerable.Range(0, _random.Next(3))
            .Select(_ => new RoutingSlip(
                Required(),
                Enumerable.Range(0, _random.Next(3)).Select(_ => new SlipActivity(Required(), _random.Next(2) == 0))));
        var timers = Enumerable.Range(0, _random.Next(3)).Select(_ =>
            _random.Next(2) == 0
                ? new Timer(TimerAction.Schedule, Required(), Optional())
                : new Timer(TimerAction.Unschedule, Required()));
        return new DiagramNode(
            id,
            NodeType.State,
            Required(),
            Optional(),
            _random.Next(3) == 0 ? "teal" : null,
            activities,
            ignores,
            requests,
            slips,
            timers,
            Optional(),
            Optional(),
            _random.Next(3) == 0 ? new Compensation(Required(), Optional()) : null);
    }
}
