using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using Json.Schema;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class GoldenTests
{
    private static readonly JsonSchema Schema =
        JsonSchema.FromText(File.ReadAllText(Path.Combine(TestFiles.RepositoryRoot(), "docs", "specs", "saga.schema.json")));

    public static TheoryData<string> Files()
    {
        var data = new TheoryData<string>();
        foreach (var file in TestFiles.Goldens())
        {
            data.Add((string)file[0]);
        }

        return data;
    }

    [Fact]
    public void Every_diagram_of_samples_and_docs_examples_has_a_golden()
    {
        var root = TestFiles.RepositoryRoot();
        var expected = new[] { "samples", Path.Combine("docs", "examples") }
            .SelectMany(dir => Directory.GetFiles(Path.Combine(root, dir), "*.saga.yaml", SearchOption.AllDirectories))
            .Select(path => Path.GetFileName(path).Replace(".saga.yaml", ".saga.json", StringComparison.Ordinal))
            .OrderBy(name => name, StringComparer.Ordinal);

        var goldens = TestFiles.Goldens().Select(g => (string)g[0]).OrderBy(name => name, StringComparer.Ordinal);

        Assert.Equal(expected, goldens);
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Reading_and_writing_a_golden_gives_the_same_bytes(string name)
    {
        var golden = TestFiles.Golden(name);

        var written = SagaDiagram.ParseJson(golden).ToJson();

        Assert.Equal(golden, written);
        Assert.DoesNotContain('\r', written);
        Assert.EndsWith("}\n", written, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void The_converter_writes_the_same_as_ToJson(string name)
    {
        var diagram = SagaDiagram.ParseJson(TestFiles.Golden(name));

        var indented = JsonSerializer.Serialize(diagram, new JsonSerializerOptions { WriteIndented = true });
        var compact = JsonSerializer.Serialize(diagram);
        var back = JsonSerializer.Deserialize<SagaDiagram>(compact)!;

        Assert.Equal(diagram.ToJson().TrimEnd('\n'), indented);
        Assert.Equal(diagram.ToCompactJson(), compact);
        Assert.Equal(diagram.ToJson(), back.ToJson());
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void The_compact_form_is_the_same_document_without_whitespace(string name)
    {
        var diagram = SagaDiagram.ParseJson(TestFiles.Golden(name));

        var compact = diagram.ToCompactJson();

        Assert.DoesNotContain('\n', compact);
        Assert.Equal(
            JsonNode.Parse(diagram.ToJson())!.ToJsonString(),
            JsonNode.Parse(compact)!.ToJsonString());
        Assert.Equal(diagram.ToJson(), SagaDiagram.ParseJson(compact).ToJson());
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void A_written_golden_validates_against_the_schema(string name)
    {
        var written = SagaDiagram.ParseJson(TestFiles.Golden(name)).ToJson();

        var result = Schema.Evaluate(JsonNode.Parse(written), new EvaluationOptions { OutputFormat = OutputFormat.List });

        Assert.True(result.IsValid, name + ": " + JsonSerializer.Serialize(result.Details.Where(d => !d.IsValid).Select(d => d.InstanceLocation + " " + string.Join("; ", d.Errors?.Values ?? []))));
    }
}
