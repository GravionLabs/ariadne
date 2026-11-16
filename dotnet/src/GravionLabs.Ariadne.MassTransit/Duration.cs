using System;
using System.Globalization;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// Writes a time span as the diagrams do: <c>30s</c>, <c>15m</c>, <c>24h</c>, <c>7d</c>. The largest unit that divides it
/// evenly; a day is written <c>24h</c> (days from two on), as a day is mostly written in code.
/// </summary>
internal static class Duration
{
    internal static string Text(TimeSpan span)
    {
        var ms = (long)span.TotalMilliseconds;
        foreach (var (unit, size) in new[] { ("d", 86_400_000L), ("h", 3_600_000L), ("m", 60_000L), ("s", 1_000L) })
        {
            if (ms % size == 0 && (unit != "d" || ms >= 2 * size))
            {
                return (ms / size).ToString(CultureInfo.InvariantCulture) + unit;
            }
        }

        return ms.ToString(CultureInfo.InvariantCulture) + "ms";
    }
}
