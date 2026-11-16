using System;
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

    /// <summary>Writes the diagram to a <c>*.saga.yaml</c> file: UTF-8 without a byte order mark.</summary>
    /// <param name="diagram">The diagram.</param>
    /// <param name="path">The file; it is replaced.</param>
    public static void Save(this SagaDiagram diagram, string path)
    {
        if (path is null)
        {
            throw new ArgumentNullException(nameof(path));
        }

        File.WriteAllText(path, diagram.ToYaml(), Utf8);
    }
}
