using System;
using System.Linq;
using System.Text;
using GravionLabs.Ariadne.MassTransit.Yaml;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

public class YamlReaderTests
{
    private const string Minimal = "version: 3\nnodes:\n  - id: s\n    type: start\n    name: Start\nedges: []\n";

    private static DiagramFormatException Rejected(string yaml) => Assert.Throws<DiagramFormatException>(() => SagaDiagramYaml.ParseYaml(yaml));

    [Fact]
    public void A_minimal_diagram_is_read()
    {
        var diagram = SagaDiagramYaml.ParseYaml(Minimal);

        Assert.Equal("Start", Assert.Single(diagram.Nodes).Name);
        Assert.Equal(Direction.TopBottom, diagram.Direction);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void Older_versions_are_rejected_with_the_hint_to_open_and_save_in_Ariadne(int version)
    {
        var e = Rejected($"version: {version}\nnodes: []\nedges: []\n");

        Assert.Contains($"version {version}", e.Message, StringComparison.Ordinal);
        Assert.Contains("open and save the file in Ariadne once", e.Message, StringComparison.Ordinal);
        Assert.Contains("line 1", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_newer_or_missing_version_is_rejected()
    {
        Assert.Contains("version: unsupported format version 4", Rejected("version: 4\nnodes: []\n").Message, StringComparison.Ordinal);
        Assert.Contains("version is missing", Rejected("nodes: []\n").Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_format_error_names_the_path_and_the_line()
    {
        var yaml = "version: 3\nnodes:\n  - id: a\n    type: start\n    name: A\n  - id: b\n    type: bogus\n    name: B\nedges: []\n";

        var e = Rejected(yaml);

        Assert.StartsWith("nodes[1].type must be one of start, end, state, any, join", e.Message, StringComparison.Ordinal);
        Assert.EndsWith("(line 7)", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_missing_key_gets_the_line_of_the_item()
    {
        var yaml = "version: 3\nnodes:\n  - id: a\n    type: start\nedges: []\n";

        Assert.EndsWith("(line 3)", Rejected(yaml).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void An_edge_to_a_missing_node_is_reported_on_its_line()
    {
        var yaml = Minimal.Replace("edges: []", "edges:\n  - id: e\n    source: s\n    target: nowhere\n", StringComparison.Ordinal);

        var e = Rejected(yaml);

        Assert.StartsWith("edges[0].target \"nowhere\" is not a node", e.Message, StringComparison.Ordinal);
        Assert.EndsWith("(line 9)", e.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("version: 3\nnodes: [\n")]
    [InlineData("version: 3\n\tnodes: []\n")]
    [InlineData("a: b: c\n")]
    public void Text_that_is_not_yaml_is_reported_with_its_position(string yaml)
    {
        var e = Rejected(yaml);

        Assert.StartsWith("Not valid YAML (line ", e.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("")]
    [InlineData("- a\n- b\n")]
    [InlineData("just text\n")]
    public void A_document_that_is_not_a_mapping_is_rejected(string yaml)
    {
        Assert.Contains("must be an object", Rejected(yaml).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_key_that_is_repeated_is_rejected()
    {
        Assert.Contains("map keys must be unique", Rejected("version: 3\nversion: 3\n").Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Two_documents_are_rejected()
    {
        Assert.Contains("more than one document", Rejected(Minimal + "---\n" + Minimal).Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Plain_scalars_resolve_by_the_core_schema_so_a_number_is_not_a_name()
    {
        var yaml = Minimal.Replace("name: Start", "name: 123", StringComparison.Ordinal);

        Assert.StartsWith("nodes[0].name must be a non-empty string", Rejected(yaml).Message, StringComparison.Ordinal);
        Assert.Equal("123", SagaDiagramYaml.ParseYaml(Minimal.Replace("name: Start", "name: \"123\"", StringComparison.Ordinal)).Nodes[0].Name);
    }

    [Fact]
    public void Yes_and_no_are_text_in_the_core_schema()
    {
        var diagram = SagaDiagramYaml.ParseYaml(Minimal.Replace("name: Start", "name: yes", StringComparison.Ordinal));

        Assert.Equal("yes", diagram.Nodes[0].Name);
    }

    [Fact]
    public void Keys_the_format_does_not_know_and_comments_are_ignored()
    {
        var yaml = "# a comment\n$schema: https://example.org/s.json\n" + Minimal + "extra: 1\n";

        Assert.Single(SagaDiagramYaml.ParseYaml(yaml).Nodes);
    }

    [Fact]
    public void Aliases_are_followed_and_fewer_than_100_are_allowed()
    {
        var names = string.Concat(Enumerable.Range(0, 50).Select(i => $"  - &a{i} \"n{i}\"\n"));
        var yaml = Minimal + "x:\n" + names + string.Concat(Enumerable.Range(0, 50).Select(i => $"  - *a{i}\n"));
        Assert.Single(SagaDiagramYaml.ParseYaml(yaml.Replace("name: Start", "name: &n Start", StringComparison.Ordinal)).Nodes);

        var withAlias = Minimal.Replace("name: Start", "name: &n Start", StringComparison.Ordinal).Replace("edges: []", "ignored: *n\nedges: []", StringComparison.Ordinal);
        Assert.Single(SagaDiagramYaml.ParseYaml(withAlias).Nodes);
    }

    [Fact]
    public void A_hundred_aliases_are_too_many()
    {
        var yaml = Minimal + "base: &b x\nlist:\n" + string.Concat(Enumerable.Repeat("  - *b\n", 100));

        var e = Rejected(yaml);

        Assert.Contains("Excessive alias count", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_billion_laughs_document_is_refused_before_it_is_expanded()
    {
        var sb = new StringBuilder("version: 3\na: &a [x, x, x, x, x, x, x, x, x]\n");
        for (var i = 0; i < 8; i++)
        {
            var prev = (char)('a' + i);
            var next = (char)('a' + i + 1);
            sb.Append(next).Append(": &").Append(next).Append(" [").Append(string.Join(", ", Enumerable.Repeat("*" + prev, 9))).Append("]\n");
        }

        // 8 levels of nine aliases each is 72 aliases, below the alias limit, and nine to the eighth power nodes: the node budget stops it.
        var e = Rejected(sb.ToString());

        Assert.Contains("Excessive alias count", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void A_document_over_5_MB_is_refused_before_it_is_parsed()
    {
        var e = Rejected(Minimal + "# " + new string('x', 5_000_001) + "\n");

        Assert.Contains("MB; diagrams up to 5 MB are read", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void More_than_5000_nodes_are_refused()
    {
        var nodes = string.Concat(Enumerable.Range(0, 5001).Select(i => $"  - id: n{i}\n    type: state\n    name: N{i}\n"));

        var e = Rejected("version: 3\nnodes:\n" + nodes + "edges: []\n");

        Assert.Contains("5001 nodes; diagrams with up to 5000 are read", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Exactly_5000_nodes_are_read()
    {
        var nodes = string.Concat(Enumerable.Range(0, 5000).Select(i => $"  - id: n{i}\n    type: state\n    name: N{i}\n"));

        Assert.Equal(5000, SagaDiagramYaml.ParseYaml("version: 3\nnodes:\n" + nodes + "edges: []\n").Nodes.Count);
    }

    [Fact]
    public void More_than_20000_edges_are_refused()
    {
        var edges = string.Concat(Enumerable.Repeat("  - {id: e, source: s, target: s}\n", 20001));

        var e = Rejected(Minimal.Replace("edges: []\n", "edges:\n", StringComparison.Ordinal) + edges);

        Assert.Contains("20001 edges; diagrams with up to 20000 are read", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Nesting_that_is_too_deep_is_refused()
    {
        var e = Rejected(Minimal + "deep: " + new string('[', 200) + new string(']', 200) + "\n");

        Assert.Contains("nested too deeply", e.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Text_with_NEL_and_line_separators_is_kept()
    {
        var text = "a\u0085b\u2028c\u2029d\u007fe";
        var diagram = new SagaDiagram(name: text);

        var back = SagaDiagramYaml.ParseYaml(diagram.ToYaml());

        Assert.Equal(text, back.Name);
        Assert.Equal(diagram.ToYaml(), back.ToYaml());
    }

    [Fact]
    public void The_writer_escapes_a_lone_surrogate_like_the_yaml_package()
    {
        var yaml = new SagaDiagram(name: "\ud800").ToYaml();

        Assert.Contains("name: \"\\ud800\"\n", yaml, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("", "\"\"")]
    [InlineData("yes", "yes")]
    [InlineData("no", "no")]
    [InlineData("null", "\"null\"")]
    [InlineData("1e3", "\"1e3\"")]
    [InlineData("true", "\"true\"")]
    [InlineData("a: b", "\"a: b\"")]
    [InlineData("a #b", "\"a #b\"")]
    [InlineData("a#b", "a#b")]
    [InlineData(" lead", "\" lead\"")]
    [InlineData("trail ", "\"trail \"")]
    [InlineData("say \"hi\"", "say \"hi\"")]
    [InlineData("\"hi\" there:", "'\"hi\" there:'")]
    [InlineData("it's: x", "\"it's: x\"")]
    [InlineData("it's", "it's")]
    [InlineData("two\nlines", "|-\n      two\n      lines")]
    public void Strings_are_quoted_like_the_yaml_package_does(string value, string expected)
    {
        var diagram = new SagaDiagram(new[] { new DiagramNode("s", NodeType.Start, "Start", value) });

        var yaml = diagram.ToYaml();

        Assert.Contains("    description: " + expected + "\n", yaml, StringComparison.Ordinal);
        Assert.Equal(value, SagaDiagramYaml.ParseYaml(yaml).Nodes[0].Description);
    }

    [Fact]
    public void A_diagram_without_nodes_is_written_with_empty_lists()
    {
        Assert.Equal("version: 3\ndirection: top-bottom\nnodes: []\nedges: []\n", new SagaDiagram().ToYaml());
    }
}
