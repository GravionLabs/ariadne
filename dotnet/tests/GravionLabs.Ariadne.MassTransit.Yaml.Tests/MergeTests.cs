using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using GravionLabs.Ariadne.MassTransit.Yaml;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

public sealed class MergeTests : IDisposable
{
    private readonly DirectoryInfo _dir = Directory.CreateTempSubdirectory();

    public static TheoryData<int> Cases()
    {
        var data = new TheoryData<int>();
        using var doc = JsonDocument.Parse(File.ReadAllText(CasesPath()));
        for (var i = 0; i < doc.RootElement.GetArrayLength(); i++)
        {
            data.Add(i);
        }

        return data;
    }

    private static string CasesPath() => Path.Combine(TestFiles.RepositoryRoot(), "docs", "specs", "diagram-merge.cases.json");

    public void Dispose() => _dir.Delete(recursive: true);

    [Theory]
    [MemberData(nameof(Cases))]
    public void The_shared_cases_of_the_specification_hold(int index)
    {
        using var doc = JsonDocument.Parse(File.ReadAllText(CasesPath()));
        var c = doc.RootElement[index];
        var existing = SagaDiagram.ParseJson(c.GetProperty("existing").GetRawText());
        var incoming = SagaDiagram.ParseJson(c.GetProperty("incoming").GetRawText());
        var expected = SagaDiagram.ParseJson(c.GetProperty("expected").GetRawText());

        var result = incoming.MergeInto(existing);

        Assert.Equal(expected.ToJson(), result.Diagram.ToJson());
        Assert.Equal(c.GetProperty("removed").EnumerateArray().Select(e => e.GetString()), result.Removed.Select(r => r.Message));
    }

    private string Path_(string name = "d.saga.yaml") => Path.Combine(_dir.FullName, name);

    private static SagaDiagram Machine(bool withPicking = false, string reserving = "a") => new(
        new[]
        {
            new DiagramNode("s", NodeType.Start, "Initial"),
            new DiagramNode(reserving, NodeType.State, "Reserving", activities: new[] { new Activity(MessageKind.Command, "Reserve") }),
            new DiagramNode("e", NodeType.End, "Final"),
        }.Concat(withPicking ? new[] { new DiagramNode("p", NodeType.State, "Picking") } : Array.Empty<DiagramNode>()),
        new[]
        {
            new DiagramEdge("x1", "s", reserving, @event: "Submitted"),
            new DiagramEdge("x2", reserving, "e", @event: "Done"),
        },
        name: "Order");

    private const string Edited =
        "version: 3\nname: My name\ndescription: By hand\nnodes:\n  - id: s\n    type: start\n    name: Initial\n"
        + "  - id: a\n    type: state\n    name: Reserving\n    description: Holds stock\n    color: blue\n    retry: 3x\n"
        + "  - id: e\n    type: end\n    name: Final\nedges:\n  - id: e1\n    source: s\n    target: a\n    event: Submitted\n    eventSource: Shop API\n"
        + "  - id: e2\n    source: a\n    target: e\n    event: Done\n";

    [Fact]
    public void Export_edit_change_export_keeps_what_a_person_wrote()
    {
        var path = Path_();
        Machine().Save(path);
        File.WriteAllText(path, Edited);

        var result = Machine(withPicking: true).Save(path);

        Assert.Empty(result.Removed);
        var saved = SagaDiagramYaml.Load(path);
        Assert.Equal("My name", saved.Name);
        Assert.Equal("By hand", saved.Description);
        Assert.Equal(new[] { "s", "a", "e", "p" }, saved.Nodes.Select(n => n.Id));
        var a = saved.Nodes[1];
        Assert.Equal(("Holds stock", "blue", "3x"), (a.Description, a.Color, a.Retry));
        Assert.Equal("Reserve", Assert.Single(a.Activities).Name);
        Assert.Equal("Shop API", saved.Edges[0].EventSource);
        Assert.Equal("e1", saved.Edges[0].Id);
    }

    [Fact]
    public void An_unchanged_machine_leaves_the_file_byte_for_byte()
    {
        var path = Path_();
        var first = Machine().Save(path);
        var bytes = File.ReadAllBytes(path);
        var stamp = new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(path, stamp);

        var second = Machine().Save(path);

        Assert.Empty(first.Removed);
        Assert.Empty(second.Removed);
        Assert.Equal(bytes, File.ReadAllBytes(path));
        Assert.Equal(stamp, File.GetLastWriteTimeUtc(path));
    }

    [Fact]
    public void An_edited_file_is_stable_when_saved_again()
    {
        var path = Path_();
        File.WriteAllText(path, Edited);
        Machine().Save(path);
        var once = File.ReadAllText(path);

        Machine().Save(path);

        Assert.Equal(once, File.ReadAllText(path));
    }

    [Fact]
    public void A_renamed_state_is_removed_and_added_and_reported()
    {
        var path = Path_();
        File.WriteAllText(path, Edited);

        var result = Machine(reserving: "r").Save(path);

        Assert.Equal("“Reserving” removed, its description, color, retry are lost", result.Removed[0].Message);
        var saved = SagaDiagramYaml.Load(path);
        Assert.Equal(new[] { "s", "e", "r" }, saved.Nodes.Select(n => n.Id));
        Assert.Null(saved.Nodes[2].Description);
    }

    [Fact]
    public void A_removed_state_is_reported()
    {
        var path = Path_();
        Machine(withPicking: true).Save(path);

        var result = Machine().Save(path);

        Assert.Equal("“Picking” removed", Assert.Single(result.Removed).Message);
    }

    [Fact]
    public void FailOnLoss_throws_and_leaves_the_file()
    {
        var path = Path_();
        File.WriteAllText(path, Edited);

        var e = Assert.Throws<DiagramLossException>(() => Machine(reserving: "r").Save(path, new SaveOptions { FailOnLoss = true }));

        Assert.Contains("“Reserving” removed", e.Message, StringComparison.Ordinal);
        Assert.Equal(Edited, File.ReadAllText(path));
    }

    [Fact]
    public void Overwrite_writes_without_merging()
    {
        var path = Path_();
        File.WriteAllText(path, Edited);

        var result = Machine().Save(path, new SaveOptions { Overwrite = true });

        Assert.Empty(result.Removed);
        Assert.Equal(Machine().ToYaml(), File.ReadAllText(path));
    }

    [Theory]
    [InlineData("version: 3\nnodes: nope\nedges: []\n")]
    [InlineData("version: 2\nnodes: []\nedges: []\n")]
    [InlineData("not: [valid")]
    public void An_invalid_or_older_file_is_not_touched(string text)
    {
        var path = Path_();
        File.WriteAllText(path, text);

        var e = Assert.Throws<DiagramFormatException>(() => Machine().Save(path));

        Assert.Contains("was not changed", e.Message, StringComparison.Ordinal);
        Assert.Contains("Overwrite", e.Message, StringComparison.Ordinal);
        Assert.Equal(text, File.ReadAllText(path));
    }

    [Fact]
    public void A_new_file_is_written()
    {
        var path = Path_("new.saga.yaml");

        var result = Machine().Save(path);

        Assert.Empty(result.Removed);
        Assert.Equal(Machine().ToYaml(), File.ReadAllText(path));
    }
}
