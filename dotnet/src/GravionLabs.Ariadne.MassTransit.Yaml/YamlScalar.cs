using System;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace GravionLabs.Ariadne.MassTransit.Yaml;

/// <summary>
/// Writes a string as a YAML scalar the way the <c>yaml</c> package (v2, <c>lineWidth: 0</c>, core schema) does:
/// plain when that reads back as the same string, a literal block for several lines, otherwise quoted. A port of its
/// <c>stringifyString</c> for a value that is neither a key nor inside a flow collection, and never folded.
/// </summary>
internal static class YamlScalar
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(1);

    // Not allowed in a plain scalar (JavaScript `^` and `$` are the ends of the string, so \A and \z here).
    private static readonly Regex NotPlain = Create(@"\A[\n\t ,\[\]{}#&*!|>'""%@`]|\A[?-]\z|\A[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]\z");

    // What the core schema reads as something other than a string: null, booleans, integers and floats.
    private static readonly Regex[] Resolved =
    {
        Create(@"\A(?:~|[Nn]ull|NULL)?\z"),
        Create(@"\A(?:[Tt]rue|TRUE|[Ff]alse|FALSE)\z"),
        Create(@"\A0o[0-7]+\z"),
        Create(@"\A[-+]?[0-9]+\z"),
        Create(@"\A0x[0-9a-fA-F]+\z"),
        Create(@"\A(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)\z"),
        Create(@"\A[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+\z"),
        Create(@"\A[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)\z"),
    };

    private static readonly Regex BlockEndNewlines = Create(@"(\A|(?<!\n))\n+(?!\n|\z)");
    private static readonly Regex Newlines = Create(@"\n+");
    private static readonly Regex EndsWithBlanksAfterNewline = Create(@"\n[\t ]+\z");
    private static readonly Regex BlanksAroundNewline = Create(@"[ \t]\n|\n[ \t]");

    /// <summary>The scalar for <paramref name="value"/>; <paramref name="indent"/> is the indent of its continuation lines.</summary>
    internal static string Write(string value, string indent)
    {
        if (NeedsDoubleQuotes(value))
        {
            return DoubleQuoted(value, indent);
        }

        if (NotPlain.IsMatch(value))
        {
            return value.IndexOf('\n') < 0 ? Quoted(value, indent) : Block(value, indent);
        }

        if (value.IndexOf('\n') >= 0)
        {
            return Block(value, indent);
        }

        foreach (var resolved in Resolved)
        {
            if (resolved.IsMatch(value))
            {
                return Quoted(value, indent);
            }
        }

        return value;
    }

    /// <summary>Control characters and lone surrogates are always written in double quotes.</summary>
    private static bool NeedsDoubleQuotes(string value)
    {
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            if (c <= 0x08 || (c >= 0x0b && c <= 0x1f) || (c >= 0x7f && c <= 0x9f))
            {
                return true;
            }

            if (char.IsHighSurrogate(c) && i + 1 < value.Length && char.IsLowSurrogate(value[i + 1]))
            {
                i++;
            }
            else if (char.IsSurrogate(c))
            {
                return true;
            }
        }

        return false;
    }

    private static string Quoted(string value, string indent)
    {
        var hasDouble = value.IndexOf('"') >= 0;
        var hasSingle = value.IndexOf('\'') >= 0;
        return hasDouble && !hasSingle ? SingleQuoted(value, indent) : DoubleQuoted(value, indent);
    }

    private static string SingleQuoted(string value, string indent)
    {
        if (BlanksAroundNewline.IsMatch(value))
        {
            return DoubleQuoted(value, indent);
        }

        return "'" + Newlines.Replace(value.Replace("'", "''"), m => m.Value + "\n" + indent) + "'";
    }

    private static string DoubleQuoted(string value, string indent)
    {
        const int MinMultiLineLength = 40;
        var json = JavaScriptString.Quote(value);
        var str = new StringBuilder();
        var start = 0;
        for (var i = 0; i < json.Length; i++)
        {
            var ch = json[i];
            if (ch == ' ' && At(json, i + 1) == '\\' && At(json, i + 2) == 'n')
            {
                // a space before a line break is escaped so that it is not folded
                str.Append(json, start, i - start).Append("\\ ");
                i += 1;
                start = i;
                ch = '\\';
            }

            if (ch != '\\')
            {
                continue;
            }

            switch (At(json, i + 1))
            {
                case 'u':
                    str.Append(json, start, i - start);
                    var code = json.Substring(i + 2, 4);
                    switch (code)
                    {
                        case "0000": str.Append("\\0"); break;
                        case "0007": str.Append("\\a"); break;
                        case "000b": str.Append("\\v"); break;
                        case "001b": str.Append("\\e"); break;
                        case "0085": str.Append("\\N"); break;
                        case "00a0": str.Append("\\_"); break;
                        case "2028": str.Append("\\L"); break;
                        case "2029": str.Append("\\P"); break;
                        default:
                            if (code.StartsWith("00", StringComparison.Ordinal))
                            {
                                str.Append("\\x").Append(code, 2, 2);
                            }
                            else
                            {
                                str.Append(json, i, 6);
                            }

                            break;
                    }

                    i += 5;
                    start = i + 1;
                    break;
                case 'n':
                    if (At(json, i + 2) == '"' || json.Length < MinMultiLineLength)
                    {
                        i += 1;
                    }
                    else
                    {
                        // folding would eat the first line break: write it as an empty line
                        str.Append(json, start, i - start).Append("\n\n");
                        while (At(json, i + 2) == '\\' && At(json, i + 3) == 'n' && At(json, i + 4) != '"')
                        {
                            str.Append('\n');
                            i += 2;
                        }

                        str.Append(indent);
                        if (At(json, i + 2) == ' ')
                        {
                            str.Append('\\');
                        }

                        i += 1;
                        start = i + 1;
                    }

                    break;
                default:
                    i += 1;
                    break;
            }
        }

        return start > 0 ? str.Append(json, start, json.Length - start).ToString() : json;
    }

    /// <summary>A literal block (<c>|</c>) with the chomping and indentation indicators the text needs.</summary>
    private static string Block(string value, string indent)
    {
        // A block cannot end in whitespace unless its last line is not empty.
        if (EndsWithBlanksAfterNewline.IsMatch(value))
        {
            return Quoted(value, indent);
        }

        var endStart = value.Length;
        while (endStart > 0 && value[endStart - 1] is '\n' or '\t' or ' ')
        {
            endStart--;
        }

        var end = value.Substring(endStart);
        var endNewline = end.IndexOf('\n');
        string chomp;
        if (endNewline == -1)
        {
            chomp = "-";
        }
        else if (value == end || endNewline != end.Length - 1)
        {
            chomp = "+";
        }
        else
        {
            chomp = string.Empty;
        }

        if (end.Length > 0)
        {
            value = value.Substring(0, value.Length - end.Length);
            if (end[end.Length - 1] == '\n')
            {
                end = end.Substring(0, end.Length - 1);
            }

            end = BlockEndNewlines.Replace(end, m => m.Value + indent);
        }

        var startWithSpace = false;
        var startEnd = 0;
        var startNewline = -1;
        for (; startEnd < value.Length; startEnd++)
        {
            var ch = value[startEnd];
            if (ch == ' ')
            {
                startWithSpace = true;
            }
            else if (ch == '\n')
            {
                startNewline = startEnd;
            }
            else
            {
                break;
            }
        }

        var lead = value.Substring(0, startNewline < startEnd ? startNewline + 1 : startEnd);
        if (lead.Length > 0)
        {
            value = value.Substring(lead.Length);
            lead = Newlines.Replace(lead, m => m.Value + indent);
        }

        var header = (startWithSpace ? "2" : string.Empty) + chomp;
        value = Newlines.Replace(value, m => m.Value + indent);
        return "|" + header + "\n" + indent + lead + value + end;
    }

    private static char At(string text, int index) => index < text.Length ? text[index] : '\0';

    private static Regex Create(string pattern) => new(pattern, RegexOptions.CultureInvariant, Timeout);
}

/// <summary><c>JSON.stringify</c> of a string: the quote, the backslash and control characters escaped, lone surrogates as <c>\uXXXX</c>.</summary>
internal static class JavaScriptString
{
    internal static string Quote(string value)
    {
        var sb = new StringBuilder(value.Length + 2).Append('"');
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < ' ' || (char.IsSurrogate(c) && !IsPaired(value, i)))
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(c);
                    }

                    break;
            }
        }

        return sb.Append('"').ToString();
    }

    private static bool IsPaired(string value, int i)
    {
        return char.IsHighSurrogate(value[i])
            ? i + 1 < value.Length && char.IsLowSurrogate(value[i + 1])
            : i > 0 && char.IsHighSurrogate(value[i - 1]);
    }
}
