using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace GravionLabs.Ariadne.MassTransit.Yaml;

/// <summary>
/// Reads and writes a <see cref="SagaDiagram"/> as <c>*.saga.yaml</c>, byte for byte as <c>@ariadne/core</c> writes it.
/// Lives in its own package so that a project that only serves JSON does not get a YAML parser (ADR 0031).
/// </summary>
public static class SagaDiagramYaml
{
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);

    /// <summary>Reads a version 3 YAML diagram.</summary>
    /// <param name="yaml">The YAML text.</param>
    /// <returns>The diagram.</returns>
    /// <exception cref="DiagramFormatException">The text is not a version 3 diagram; the message names the path in the document and the line. Versions 1 and 2 are rejected with the hint to open and save the file in Ariadne once.</exception>
    public static SagaDiagram ParseYaml(string yaml)
    {
        if (yaml is null)
        {
            throw new ArgumentNullException(nameof(yaml));
        }

        return DiagramYamlReader.Read(yaml);
    }

    /// <summary>Reads a version 3 <c>*.saga.yaml</c> file (UTF-8).</summary>
    /// <param name="path">The file.</param>
    /// <returns>The diagram.</returns>
    /// <exception cref="DiagramFormatException">The file is not a version 3 diagram.</exception>
    public static SagaDiagram Load(string path)
    {
        if (path is null)
        {
            throw new ArgumentNullException(nameof(path));
        }

        return ParseYaml(File.ReadAllText(path, Utf8));
    }

    /// <summary>
    /// The diagram as YAML in the form of the format specification: its key order, block style, two spaces, no line
    /// wrapping, LF line ends on every platform and a trailing newline. Unset optional fields are left out.
    /// </summary>
    /// <param name="diagram">The diagram.</param>
    /// <returns>The YAML text.</returns>
    public static string ToYaml(this SagaDiagram diagram)
    {
        if (diagram is null)
        {
            throw new ArgumentNullException(nameof(diagram));
        }

        return DiagramYamlWriter.Write(diagram);
    }

    /// <summary>
    /// Writes the diagram to a <c>*.saga.yaml</c> file: UTF-8 without a byte order mark. When the file exists, the
    /// diagram is merged into it (<see cref="SagaDiagram.MergeInto"/>, <c>docs/specs/diagram-merge.md</c>) so that what a
    /// person wrote stays; <see cref="SaveOptions.Overwrite"/> replaces it instead. A file that is already what would
    /// be written is not touched. YAML comments in an existing file are lost, as when Ariadne saves it.
    /// </summary>
    /// <param name="diagram">The diagram.</param>
    /// <param name="path">The file.</param>
    /// <param name="options">How to treat an existing file; <see langword="null"/> merges.</param>
    /// <returns>What the merge dropped from the existing file; empty when the file is new or overwritten.</returns>
    /// <exception cref="DiagramFormatException">The existing file is not a valid version 3 diagram; it is not touched. Fix it, or save with <see cref="SaveOptions.Overwrite"/>.</exception>
    /// <exception cref="DiagramLossException"><see cref="SaveOptions.FailOnLoss"/> is set and the merge would drop something; the file is not touched.</exception>
    public static SaveResult Save(this SagaDiagram diagram, string path, SaveOptions? options = null)
    {
        if (diagram is null)
        {
            throw new ArgumentNullException(nameof(diagram));
        }

        if (path is null)
        {
            throw new ArgumentNullException(nameof(path));
        }

        options ??= new SaveOptions();
        var result = diagram;
        IReadOnlyList<MergeRemoval> removed = Array.Empty<MergeRemoval>();
        string? current = null;
        if (File.Exists(path))
        {
            current = File.ReadAllText(path, Utf8);
            if (!options.Overwrite)
            {
                SagaDiagram existing;
                try
                {
                    existing = ParseYaml(current);
                }
                catch (DiagramFormatException e)
                {
                    throw new DiagramFormatException(
                        $"{path} was not changed: it is not a diagram this version can merge into ({e.Message}). Fix the file, or save with SaveOptions.Overwrite to replace it.",
                        e);
                }

                var merged = diagram.MergeInto(existing);
                if (options.FailOnLoss && merged.Removed.Count > 0)
                {
                    throw new DiagramLossException(merged.Removed);
                }

                result = merged.Diagram;
                removed = merged.Removed;
            }
        }

        var yaml = result.ToYaml();
        if (!string.Equals(current, yaml, StringComparison.Ordinal))
        {
            File.WriteAllText(path, yaml, Utf8);
        }

        return new SaveResult(removed);
    }
}

/// <summary>How <see cref="SagaDiagramYaml.Save"/> treats an existing file.</summary>
public sealed class SaveOptions
{
    /// <summary>Write the diagram as it is, without merging the existing file into it.</summary>
    public bool Overwrite { get; set; }

    /// <summary>Throw a <see cref="DiagramLossException"/> instead of dropping an element of the existing file.</summary>
    public bool FailOnLoss { get; set; }
}

/// <summary>What <see cref="SagaDiagramYaml.Save"/> reports.</summary>
public sealed class SaveResult
{
    internal SaveResult(IReadOnlyList<MergeRemoval> removed)
    {
        Removed = removed;
    }

    /// <summary>The elements of the existing file that the diagram does not have and that were dropped.</summary>
    public IReadOnlyList<MergeRemoval> Removed { get; }
}
