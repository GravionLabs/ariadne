using System;
using System.IO;
using System.Linq;
using GravionLabs.Ariadne.MassTransit.Yaml;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

public class YamlGoldenTests
{
    public static TheoryData<string> Files()
    {
        var root = TestFiles.RepositoryRoot();
        var data = new TheoryData<string>();
        foreach (var path in new[] { "samples", Path.Combine("docs", "examples") }
            .SelectMany(dir => Directory.GetFiles(Path.Combine(root, dir), "*.saga.yaml", SearchOption.AllDirectories))
            .Select(p => Path.GetRelativePath(root, p))
            .OrderBy(p => p, StringComparer.Ordinal))
        {
            data.Add(path);
        }

        return data;
    }

    [Fact]
    public void There_are_diagrams_to_compare()
    {
        Assert.True(Files().Count >= 10);
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Reading_and_writing_a_diagram_gives_the_same_bytes(string relativePath)
    {
        var text = File.ReadAllText(Path.Combine(TestFiles.RepositoryRoot(), relativePath));

        var written = SagaDiagramYaml.ParseYaml(text).ToYaml();

        Assert.Equal(text, written);
        Assert.DoesNotContain('\r', written);
        Assert.EndsWith("\n", written, StringComparison.Ordinal);
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void The_yaml_and_the_json_of_a_diagram_are_the_same_model(string relativePath)
    {
        var path = Path.Combine(TestFiles.RepositoryRoot(), relativePath);

        var fromYaml = SagaDiagramYaml.Load(path);
        var fromJson = SagaDiagram.ParseJson(fromYaml.ToJson());

        Assert.Equal(fromYaml.ToJson(), fromJson.ToJson());
        Assert.Equal(fromYaml.ToYaml(), fromJson.ToYaml());
    }

    [Fact]
    public void Save_writes_utf8_without_a_byte_order_mark()
    {
        var dir = Directory.CreateTempSubdirectory();
        try
        {
            var path = Path.Combine(dir.FullName, "d.saga.yaml");
            var diagram = new SagaDiagram(name: "Größe ✓");

            diagram.Save(path);

            var bytes = File.ReadAllBytes(path);
            Assert.NotEqual(0xEF, bytes[0]);
            Assert.Equal(diagram.ToYaml(), SagaDiagramYaml.Load(path).ToYaml());
            Assert.Equal(diagram.ToYaml(), System.Text.Encoding.UTF8.GetString(bytes));
        }
        finally
        {
            dir.Delete(recursive: true);
        }
    }
}
