using System;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>
/// A <c>System.Text.Json</c> converter for <see cref="SagaDiagram"/>. It writes the key order and the escaping of
/// <see cref="SagaDiagram.ToJson"/>; the indentation follows <see cref="JsonSerializerOptions.WriteIndented"/>
/// (two spaces when set, none when not). It reads a version 3 diagram like <see cref="SagaDiagram.ParseJson"/>.
/// Other options (naming policy, encoder) do not apply: the format is fixed.
/// </summary>
public sealed class SagaDiagramJsonConverter : JsonConverter<SagaDiagram>
{
    /// <inheritdoc/>
    public override SagaDiagram Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var document = JsonDocument.ParseValue(ref reader);
        return DiagramJsonReader.Read(document.RootElement);
    }

    /// <inheritdoc/>
    public override void Write(Utf8JsonWriter writer, SagaDiagram value, JsonSerializerOptions options)
    {
        if (writer is null)
        {
            throw new ArgumentNullException(nameof(writer));
        }

        if (value is null)
        {
            throw new ArgumentNullException(nameof(value));
        }

        if (options is null)
        {
            throw new ArgumentNullException(nameof(options));
        }

        writer.WriteRawValue(DiagramJsonWriter.Write(value, options.WriteIndented), skipInputValidation: true);
    }
}
