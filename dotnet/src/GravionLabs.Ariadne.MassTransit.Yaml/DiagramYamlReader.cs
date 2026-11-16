using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;

namespace GravionLabs.Ariadne.MassTransit.Yaml;

/// <summary>
/// Reads a version 3 <c>*.saga.yaml</c>. The text is parsed with YamlDotNet into a tree (YAML 1.2 core schema, like the
/// <c>yaml</c> package of <c>@ariadne/core</c>), written as JSON and read by the JSON reader of the core package, so
/// the checks and the messages are the same for both containers. A message gets the line of the place it names.
/// </summary>
internal static class DiagramYamlReader
{
    private const int MaxBytes = 5_000_000;
    private const int MaxAliases = 100;
    private const int MaxDepth = 60;
    private const int MaxExpandedNodes = 1_000_000;

    private static readonly Regex NullText = Create(@"\A(?:~|[Nn]ull|NULL)?\z");
    private static readonly Regex BoolText = Create(@"\A(?:[Tt]rue|TRUE|[Ff]alse|FALSE)\z");
    private static readonly Regex OctalText = Create(@"\A0o[0-7]+\z");
    private static readonly Regex DecimalText = Create(@"\A[-+]?[0-9]+\z");
    private static readonly Regex HexText = Create(@"\A0x[0-9a-fA-F]+\z");
    private static readonly Regex SpecialFloatText = Create(@"\A(?:([-+]?)\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)\z");
    private static readonly Regex FloatText = Create(@"\A[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?\z");
    private static readonly Regex BlockHeader = Create(@"\A(?: *(?:- )+|(?: *(?:- )*)[^\s#-][^\n]*?: )[|>]([1-9])?[+-]?[ \t]*\z");
    private static readonly Regex PathStart = Create(@"\A[A-Za-z0-9_]+(?:\[[0-9]+\]|\.[A-Za-z0-9_]+)*");

    internal static SagaDiagram Read(string yaml)
    {
        var bytes = Encoding.UTF8.GetByteCount(yaml);
        if (bytes > MaxBytes)
        {
            throw new DiagramFormatException($"The document is {bytes / 1_000_000.0:0.#} MB; diagrams up to {MaxBytes / 1_000_000} MB are read.");
        }

        var root = Parse(Mask(yaml), retry: true);
        if (root is not Mapping file)
        {
            throw new DiagramFormatException($"the document must be an object (line {root?.Line ?? 1})");
        }

        CheckVersion(file);

        var lines = new Dictionary<string, int>(StringComparer.Ordinal);
        var json = ToJson(root, lines);

        try
        {
            return SagaDiagram.ParseJson(json);
        }
        catch (DiagramFormatException e)
        {
            throw new DiagramFormatException(WithLine(e.Message, lines), e);
        }
    }

    // ---- characters YamlDotNet reads as YAML 1.1

    // YAML 1.2 (the yaml package) has no line breaks but LF and CR and accepts the C1 controls in a scalar; YamlDotNet
    // treats NEL, LS and PS as line breaks and refuses the controls. They only occur inside scalars, so they are
    // replaced by a private-use pair before parsing and put back in the scalar text.
    private const char Escape = '\uE000';
    private const char Offset = '\uE100';

    private static readonly char[] Masked = Enumerable.Range(0x7f, 0x21).Select(c => (char)c).Concat(new[] { '\u2028', '\u2029', Escape }).ToArray();

    private const int SpaceMarker = 0x24;

    private static bool NeedsMask(char c) => Array.IndexOf(Masked, c) >= 0;

    private static string Mask(string text)
    {
        if (!text.Any(NeedsMask))
        {
            return text;
        }

        var sb = new StringBuilder(text.Length + 16);
        foreach (var c in text)
        {
            if (NeedsMask(c))
            {
                sb.Append(Escape).Append((char)(Offset + Array.IndexOf(Masked, c)));
            }
            else
            {
                sb.Append(c);
            }
        }

        return sb.ToString();
    }

    /// <summary>
    /// In a literal block, a first line that is only spaces: without an indentation indicator it is an empty line, with
    /// one the spaces beyond the indent are content, which are written as a private-use pair so that the line is not blank.
    /// </summary>
    private static string NormalizeBlockStarts(string text)
    {
        var lines = text.Split('\n');
        for (var i = 0; i + 1 < lines.Length; i++)
        {
            var header = BlockHeader.Match(lines[i]);
            var next = lines[i + 1];
            if (!header.Success || next.Length == 0 || next.Trim(' ').Length > 0)
            {
                continue;
            }

            if (!header.Groups[1].Success)
            {
                lines[i + 1] = string.Empty;
                continue;
            }

            // The indent of the content: the column of the key or dash that owns the block, plus the indicator.
            var line = lines[i];
            var owner = line.Length - line.TrimStart(' ').Length;
            var rest = line.Substring(owner);
            while (rest.StartsWith("- ", StringComparison.Ordinal) && rest[2] is not ('|' or '>'))
            {
                owner += 2;
                rest = rest.Substring(2);
            }

            var indent = owner + (header.Groups[1].Value[0] - '0');
            if (next.Length > indent)
            {
                var marker = new string(new[] { Escape, (char)(Offset + SpaceMarker) });
                lines[i + 1] = new string(' ', indent) + string.Concat(Enumerable.Repeat(marker, next.Length - indent));
            }
        }

        return string.Join("\n", lines);
    }

    private static string Unmask(string text)
    {
        if (text.IndexOf(Escape) < 0)
        {
            return text;
        }

        var sb = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            if (text[i] == Escape && i + 1 < text.Length)
            {
                var index = text[++i] - Offset;
                sb.Append(index == SpaceMarker ? ' ' : Masked[index]);
            }
            else
            {
                sb.Append(text[i]);
            }
        }

        return sb.ToString();
    }

    // ---- the tree

    private abstract class Node
    {
        internal int Line { get; set; }
    }

    private sealed class Scalar : Node
    {
        internal string Text { get; set; } = string.Empty;

        internal bool Quoted { get; set; }

        internal string? Tag { get; set; }
    }

    private sealed class Sequence : Node
    {
        internal List<Node> Items { get; } = new();
    }

    private sealed class Mapping : Node
    {
        internal List<KeyValuePair<string, Node>> Pairs { get; } = new();

        internal Node? Get(string key)
        {
            foreach (var pair in Pairs)
            {
                if (pair.Key == key)
                {
                    return pair.Value;
                }
            }

            return null;
        }
    }

    private static Node? Parse(string yaml, bool retry)
    {
        var parser = new Parser(new StringReader(yaml));
        var stack = new Stack<Node>();
        var pendingKeys = new Stack<string?>();
        var anchors = new Dictionary<string, Node>(StringComparer.Ordinal);
        Mapping? keyOwner = null;
        var aliases = 0;
        Node? root = null;
        var any = false;

        try
        {
            while (parser.MoveNext())
            {
                var current = parser.Current;
                switch (current)
                {
                    case DocumentStart when any:
                        throw new DiagramFormatException($"Not valid YAML: the file has more than one document (line {current!.Start.Line}).");
                    case DocumentStart:
                        any = true;
                        break;
                    case MappingStart ms:
                        Open(new Mapping { Line = (int)ms.Start.Line }, (ms.Anchor.IsEmpty ? null : ms.Anchor.Value));
                        break;
                    case SequenceStart ss:
                        Open(new Sequence { Line = (int)ss.Start.Line }, (ss.Anchor.IsEmpty ? null : ss.Anchor.Value));
                        break;
                    case MappingEnd:
                    case SequenceEnd:
                        stack.Pop();
                        break;
                    case YamlDotNet.Core.Events.Scalar sc:
                        Add(
                            new Scalar
                            {
                                Line = (int)sc.Start.Line,
                                Text = Unmask(sc.Value),
                                Quoted = sc.Style != ScalarStyle.Plain,
                                Tag = sc.Tag.IsEmpty ? null : sc.Tag.Value,
                            },
                            (sc.Anchor.IsEmpty ? null : sc.Anchor.Value),
                            (int)sc.Start.Line);
                        break;
                    case AnchorAlias alias:
                        if (++aliases >= MaxAliases)
                        {
                            throw new DiagramFormatException(
                                $"Not valid YAML: Excessive alias count indicates a resource exhaustion attack (line {alias.Start.Line}).");
                        }

                        if (!anchors.TryGetValue(alias.Value.Value, out var target))
                        {
                            throw new DiagramFormatException($"Not valid YAML: unresolved alias *{alias.Value.Value} (line {alias.Start.Line}).");
                        }

                        Add(target, null, (int)alias.Start.Line);
                        break;
                }
            }
        }
        catch (YamlException e) when (retry && e.Message.Contains("extra spaces in first line"))
        {
            // YamlDotNet refuses a literal block that starts with a line of exactly the indent in spaces, which the
            // yaml package writes for a text that starts with a line break. Such a line is an empty line.
            return Parse(NormalizeBlockStarts(yaml), retry: false);
        }
        catch (YamlException e)
        {
            throw new DiagramFormatException(
                $"Not valid YAML (line {e.Start.Line}, column {e.Start.Column}): {e.Message.Split('\n')[0]}", e);
        }

        return root;

        void Open(Node node, string? anchor)
        {
            Add(node, anchor, node.Line);
            stack.Push(node);
            if (stack.Count > MaxDepth)
            {
                throw new DiagramFormatException("The file is nested too deeply to be read as a diagram.");
            }
        }

        void Add(Node node, string? anchor, int line)
        {
            if (!string.IsNullOrEmpty(anchor))
            {
                anchors[anchor!] = node;
            }

            if (stack.Count == 0)
            {
                root = node;
                return;
            }

            switch (stack.Peek())
            {
                case Sequence sequence:
                    sequence.Items.Add(node);
                    break;
                case Mapping mapping:
                    if (pendingKeys.Count > 0 && pendingKeys.Peek() is { } key && keyOwner == mapping)
                    {
                        pendingKeys.Pop();
                        keyOwner = null;
                        foreach (var pair in mapping.Pairs)
                        {
                            if (pair.Key == key)
                            {
                                throw new DiagramFormatException($"Not valid YAML: map keys must be unique; \"{key}\" is repeated (line {line}).");
                            }
                        }

                        mapping.Pairs.Add(new KeyValuePair<string, Node>(key, node));
                    }
                    else
                    {
                        if (node is not Scalar scalar)
                        {
                            throw new DiagramFormatException($"Not valid YAML: a key must be a text (line {line}).");
                        }

                        pendingKeys.Push(scalar.Text);
                        keyOwner = mapping;
                    }

                    break;
            }
        }
    }

    // ---- checks on the tree

    private static void CheckVersion(Mapping file)
    {
        if (file.Get("version") is Scalar { Quoted: false } version
            && int.TryParse(version.Text, NumberStyles.None, CultureInfo.InvariantCulture, out var number)
            && (number == 1 || number == 2))
        {
            throw new DiagramFormatException(
                $"version: format version {number} is no longer read (line {version.Line}); open and save the file in Ariadne once to bring it to version {AriadneFormat.Version}.");
        }
    }

    // ---- the tree as JSON

    private static string ToJson(Node root, Dictionary<string, int> lines)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            var budget = MaxExpandedNodes;
            Write(writer, root, string.Empty, 0, lines, ref budget);
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static void Write(Utf8JsonWriter writer, Node node, string path, int depth, Dictionary<string, int> lines, ref int budget)
    {
        if (--budget < 0)
        {
            throw new DiagramFormatException("Not valid YAML: Excessive alias count indicates a resource exhaustion attack.");
        }

        if (depth > MaxDepth)
        {
            throw new DiagramFormatException("The file is nested too deeply to be read as a diagram.");
        }

        if (path.Length > 0)
        {
            lines[path] = node.Line;
        }

        switch (node)
        {
            case Mapping mapping:
                writer.WriteStartObject();
                foreach (var pair in mapping.Pairs)
                {
                    writer.WritePropertyName(pair.Key);
                    Write(writer, pair.Value, path.Length == 0 ? pair.Key : path + "." + pair.Key, depth + 1, lines, ref budget);
                }

                writer.WriteEndObject();
                break;
            case Sequence sequence:
                writer.WriteStartArray();
                for (var i = 0; i < sequence.Items.Count; i++)
                {
                    Write(writer, sequence.Items[i], $"{path}[{i}]", depth + 1, lines, ref budget);
                }

                writer.WriteEndArray();
                break;
            case Scalar scalar:
                WriteScalar(writer, scalar);
                break;
        }
    }

    /// <summary>A plain scalar is resolved by the core schema; a quoted one, a block and one tagged <c>!!str</c> are text.</summary>
    private static void WriteScalar(Utf8JsonWriter writer, Scalar scalar)
    {
        var text = scalar.Text;
        if (scalar.Quoted || scalar.Tag == "tag:yaml.org,2002:str")
        {
            writer.WriteStringValue(text);
        }
        else if (NullText.IsMatch(text))
        {
            writer.WriteNullValue();
        }
        else if (BoolText.IsMatch(text))
        {
            writer.WriteBooleanValue(text[0] is 't' or 'T');
        }
        else if (DecimalText.IsMatch(text) && long.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var integer))
        {
            writer.WriteNumberValue(integer);
        }
        else if (OctalText.IsMatch(text))
        {
            writer.WriteNumberValue(Convert.ToInt64(text.Substring(2), 8));
        }
        else if (HexText.IsMatch(text))
        {
            writer.WriteNumberValue(Convert.ToInt64(text.Substring(2), 16));
        }
        else if (SpecialFloatText.IsMatch(text))
        {
            // JSON has no infinity or NaN; null is not a string either, so the JSON reader rejects it where a string is due.
            writer.WriteNullValue();
        }
        else if (FloatText.IsMatch(text)
            && double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
            && !double.IsInfinity(number))
        {
            writer.WriteNumberValue(number);
        }
        else
        {
            writer.WriteStringValue(text);
        }
    }

    /// <summary>Appends the line of the place a message names (<c>nodes[2].type must be …</c>); an unknown place gets its parent's.</summary>
    private static string WithLine(string message, Dictionary<string, int> lines)
    {
        var match = PathStart.Match(message);
        var path = match.Success ? match.Value : string.Empty;
        while (path.Length > 0)
        {
            if (lines.TryGetValue(path, out var line))
            {
                return $"{message} (line {line})";
            }

            var cut = Math.Max(path.LastIndexOf('.'), path.LastIndexOf('['));
            path = cut > 0 ? path.Substring(0, cut) : string.Empty;
        }

        return $"{message} (line 1)";
    }

    private static Regex Create(string pattern) => new(pattern, RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
}
