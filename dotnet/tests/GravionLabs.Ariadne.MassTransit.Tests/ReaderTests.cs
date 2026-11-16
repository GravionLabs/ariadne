using System;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class ReaderTests
{
    private const string Valid = """
        {"version":3,"nodes":[{"id":"start-1","type":"start","name":"Initial"},{"id":"s","type":"state","name":"S"},{"id":"end-1","type":"end","name":"End"}],
         "edges":[{"id":"e1","source":"start-1","target":"s","event":"Go"}]}
        """;

    private static string Message(string json) => Assert.Throws<DiagramFormatException>(() => SagaDiagram.ParseJson(json)).Message;

    [Theory]
    [InlineData("""{"version":2,"nodes":[],"edges":[]}""", "version: unsupported format version 2 (expected 3)")]
    [InlineData("""{"version":4}""", "version: unsupported format version 4 (expected 3)")]
    [InlineData("""{"version":"3"}""", "version: unsupported format version \"3\" (expected 3)")]
    [InlineData("""{"nodes":[]}""", "version is missing (expected 3)")]
    [InlineData("[]", "the document must be an object")]
    [InlineData("""{"version":3,"nodes":{}}""", "nodes must be an array")]
    [InlineData("""{"version":3,"direction":"up"}""", "direction must be one of top-bottom, bottom-top, left-right, right-left")]
    [InlineData("""{"version":3,"spacing":"tight"}""", "spacing must be one of compact, normal, spacious")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"step","name":"A"}]}""", "nodes[0].type must be one of start, end, state, any, join")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state"}]}""", "nodes[0].name must be a non-empty string")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","color":"mauve"}]}""", "nodes[0].color must be one of red, orange, amber, green, teal, blue, purple, pink or a #rrggbb value")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"end","name":"A","activities":[]}]}""", "nodes[0].activities is only allowed on states, not on the final state")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"any","name":"A","timers":[]}]}""", "nodes[0].timers is only allowed on states")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","activities":[{"command":"X","event":"Y"}]}]}""", "nodes[0].activities[0] must be \"command: <Name>\" or \"event: <Name>\"")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","ignores":["E",""]}]}""", "nodes[0].ignores[1] must be a non-empty string")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","requests":[{"timeout":"1s"}]}]}""", "nodes[0].requests[0] must be \"request: <Name>\"")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","routingSlips":[{"routingSlip":"R","activities":[{"activity":"A","compensates":"yes"}]}]}]}""", "nodes[0].routingSlips[0].activities[0].compensates must be true or false")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","timers":[{"unschedule":"T","delay":"1s"}]}]}""", "nodes[0].timers[0].delay is only allowed with schedule")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","timers":[{"delay":"1s"}]}]}""", "nodes[0].timers[0] must be \"schedule: <Name>\" or \"unschedule: <Name>\"")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A","compensation":{}}]}""", "nodes[0].compensation.name must be a non-empty string")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A"},{"id":"a","type":"state","name":"B"}]}""", "nodes: duplicate node id \"a\"")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"any","name":"A"},{"id":"b","type":"any","name":"B"}]}""", "nodes: there can be only one node of type \"any\"")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A"}],"edges":[{"id":"e","source":"a","target":"zz"}]}""", "edges[0].target \"zz\" is not a node")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A"}],"edges":[{"id":"e","source":"a","target":"a","kind":"back"}]}""", "edges[0].kind must be one of forward, compensation")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A"}],"edges":[{"id":"e","source":"a","target":"a","guard":"x"}]}""", "edges[0].guard needs an event: a guard is a condition on an event")]
    [InlineData("""{"version":3,"nodes":[{"id":"a","type":"state","name":"A"}],"edges":[{"id":"e","source":"a","target":"a","activities":[]}]}""", "edges[0].activities is not allowed: activities belong to states (nodes[].activities)")]
    [InlineData("""{"version":3,"events":[{"name":"E"},{"name":"E"}]}""", "events[1]: the event \"E\" is described twice")]
    [InlineData("""{"version":3,"saga":{"class":1}}""", "saga.class must be a string")]
    public void A_document_that_is_not_a_version_3_diagram_is_rejected_with_the_path(string json, string message)
    {
        Assert.Equal(message, Message(json));
    }

    [Fact]
    public void Text_that_is_not_JSON_is_rejected()
    {
        Assert.StartsWith("Not valid JSON", Message("version: 3\nnodes: []"), StringComparison.Ordinal);
        Assert.StartsWith("Not valid JSON", Message("{\"version\": 3,"), StringComparison.Ordinal);
    }

    [Fact]
    public void A_null_text_is_an_argument_error()
    {
        Assert.Throws<ArgumentNullException>(() => SagaDiagram.ParseJson(null!));
    }

    [Fact]
    public void Unknown_keys_and_the_schema_pointer_are_ignored_and_not_written()
    {
        var diagram = SagaDiagram.ParseJson("""{"$schema":"x","version":3,"future":1,"nodes":[{"id":"a","type":"start","name":"A","more":true}]}""");

        Assert.DoesNotContain("$schema", diagram.ToJson(), StringComparison.Ordinal);
        Assert.DoesNotContain("future", diagram.ToJson(), StringComparison.Ordinal);
    }

    [Fact]
    public void The_model_is_read_in_full()
    {
        var diagram = SagaDiagram.ParseJson(Valid);

        Assert.Equal(3, diagram.Nodes.Count);
        Assert.Equal(Direction.TopBottom, diagram.Direction);
        Assert.Null(diagram.Spacing);
        Assert.Equal(NodeType.Start, diagram.Nodes[0].Type);
        Assert.Equal("Go", diagram.Edges[0].Event);
        Assert.Equal(EdgeKind.Forward, diagram.Edges[0].Kind);
    }

    [Fact]
    public void Normal_spacing_reads_as_unset_and_text_fields_are_trimmed_like_the_TypeScript_reader()
    {
        var diagram = SagaDiagram.ParseJson("""{"version":3,"name":"  Order ","spacing":"normal","saga":{"class":"  "}}""");

        Assert.Equal("Order", diagram.Name);
        Assert.Null(diagram.Spacing);
        Assert.Null(diagram.Saga);
    }
}
