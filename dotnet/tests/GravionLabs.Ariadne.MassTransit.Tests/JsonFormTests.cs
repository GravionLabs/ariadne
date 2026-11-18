using System;
using System.Text.Json;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class JsonFormTests
{
    private static SagaDiagram Minimal(string name) =>
        new(nodes: new[] { new DiagramNode("start-1", NodeType.Start, name) });

    [Fact]
    public void Unset_optional_fields_are_omitted_and_the_key_order_is_the_one_of_the_specification()
    {
        var diagram = new SagaDiagram(
            nodes: new[]
            {
                new DiagramNode("start-1", NodeType.Start, "Initial"),
                new DiagramNode(
                    "state-1",
                    NodeType.State,
                    "Charging",
                    description: "d",
                    color: "blue",
                    activities: new[] { new Activity(MessageKind.Command, "Charge"), new Activity(MessageKind.Event, "Started") },
                    ignores: new[] { "Noise" },
                    requests: new[] { new Request("Validate", "30s"), new Request("Other") },
                    routingSlips: new[] { new RoutingSlip("Fulfil", new[] { new SlipActivity("Reserve", compensates: true), new SlipActivity("Ship") }) },
                    timers: new[] { new Timer(TimerAction.Schedule, "Expire", "1m"), new Timer(TimerAction.Unschedule, "Expire") },
                    retry: "3 attempts",
                    timeout: "30s",
                    compensation: new Compensation("Refund", "undo")),
            },
            edges: new[] { new DiagramEdge("edge-1", "start-1", "state-1", EdgeKind.Compensation, "Go", "Shop API", "x > 1"), new DiagramEdge("edge-2", "state-1", "start-1") },
            name: "N",
            description: "D",
            saga: new SagaInfo("C", "Ns", "I", "S", "Cn", "../C.cs"),
            events: new[] { new EventInfo("Go", "GoMsg", "CorrelationId") },
            direction: Direction.LeftRight,
            spacing: Spacing.Spacious);

        const string expected = """
            {
              "version": 3,
              "name": "N",
              "description": "D",
              "saga": {
                "class": "C",
                "namespace": "Ns",
                "instance": "I",
                "stateProperty": "S",
                "contractsNamespace": "Cn",
                "source": "../C.cs"
              },
              "events": [
                {
                  "name": "Go",
                  "messageType": "GoMsg",
                  "correlation": "CorrelationId"
                }
              ],
              "direction": "left-right",
              "spacing": "spacious",
              "nodes": [
                {
                  "id": "start-1",
                  "type": "start",
                  "name": "Initial"
                },
                {
                  "id": "state-1",
                  "type": "state",
                  "name": "Charging",
                  "description": "d",
                  "color": "blue",
                  "activities": [
                    {
                      "command": "Charge"
                    },
                    {
                      "event": "Started"
                    }
                  ],
                  "ignores": [
                    "Noise"
                  ],
                  "requests": [
                    {
                      "request": "Validate",
                      "timeout": "30s"
                    },
                    {
                      "request": "Other"
                    }
                  ],
                  "routingSlips": [
                    {
                      "routingSlip": "Fulfil",
                      "activities": [
                        {
                          "activity": "Reserve",
                          "compensates": true
                        },
                        {
                          "activity": "Ship"
                        }
                      ]
                    }
                  ],
                  "timers": [
                    {
                      "schedule": "Expire",
                      "delay": "1m"
                    },
                    {
                      "unschedule": "Expire"
                    }
                  ],
                  "retry": "3 attempts",
                  "timeout": "30s",
                  "compensation": {
                    "name": "Refund",
                    "description": "undo"
                  }
                }
              ],
              "edges": [
                {
                  "id": "edge-1",
                  "source": "start-1",
                  "target": "state-1",
                  "kind": "compensation",
                  "event": "Go",
                  "eventSource": "Shop API",
                  "guard": "x > 1"
                },
                {
                  "id": "edge-2",
                  "source": "state-1",
                  "target": "start-1",
                  "kind": "forward"
                }
              ]
            }

            """;
        Assert.Equal(expected.ReplaceLineEndings("\n"), diagram.ToJson());
        Assert.Equal(expected.ReplaceLineEndings("\n"), SagaDiagram.ParseJson(expected).ToJson());
    }

    [Fact]
    public void An_empty_diagram_writes_empty_arrays_and_the_default_direction()
    {
        Assert.Equal(
            "{\n  \"version\": 3,\n  \"direction\": \"top-bottom\",\n  \"nodes\": [],\n  \"edges\": []\n}\n",
            new SagaDiagram().ToJson());
        Assert.Equal("{\"version\":3,\"direction\":\"top-bottom\",\"nodes\":[],\"edges\":[]}", new SagaDiagram().ToCompactJson());
    }

    [Fact]
    public void Normal_spacing_is_not_written()
    {
        Assert.DoesNotContain("spacing", new SagaDiagram(spacing: Spacing.Normal).ToJson(), StringComparison.Ordinal);
    }

    [Fact]
    public void Strings_are_escaped_like_JSON_stringify()
    {
        // JSON.stringify: quote, backslash and control characters only; hex digits in lower case; lone surrogates
        // as \udXXX; everything else (non-ASCII, <, >, &, ', U+2028) as it is.
        var name = "q\" b\\ \b\f\n\r\t \u0001\u001f \u007f é€😀 <>&'+ \u2028 \ud800 x \udc00";

        var json = Minimal(name).ToJson();

        Assert.Contains(
            "\"name\": \"q\\\" b\\\\ \\b\\f\\n\\r\\t \\u0001\\u001f \u007f é€😀 <>&'+ \u2028 \\ud800 x \\udc00\"",
            json,
            StringComparison.Ordinal);

        // A lone surrogate cannot be read back by System.Text.Json; that is a message, not a crash.
        Assert.Throws<DiagramFormatException>(() => SagaDiagram.ParseJson(json));
        var withoutSurrogates = "q\" \u0001 é€😀";
        Assert.Equal(withoutSurrogates, SagaDiagram.ParseJson(Minimal(withoutSurrogates).ToJson()).Nodes[0].Name);
    }

    [Fact]
    public void Non_ASCII_text_is_written_as_it_is()
    {
        var json = new SagaDiagram(name: "Bestellung für Müller – 注文").ToJson();

        Assert.Contains("\"Bestellung für Müller – 注文\"", json, StringComparison.Ordinal);
    }

    [Fact]
    public void The_output_has_no_carriage_return_whatever_the_platform()
    {
        Assert.DoesNotContain('\r', Minimal("a\r\nb").ToJson().Replace("\\r", string.Empty, StringComparison.Ordinal));
        Assert.DoesNotContain(Environment.NewLine == "\n" ? "\r" : Environment.NewLine, new SagaDiagram().ToJson(), StringComparison.Ordinal);
    }

    [Fact]
    public void The_converter_follows_WriteIndented_inside_another_document()
    {
        var wrapper = new { Diagram = new SagaDiagram(name: "x") };

        var json = JsonSerializer.Serialize(wrapper);

        Assert.Equal("{\"Diagram\":{\"version\":3,\"name\":\"x\",\"direction\":\"top-bottom\",\"nodes\":[],\"edges\":[]}}", json);
    }
}
