using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using GravionLabs.Ariadne.MassTransit.Yaml;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

/// <summary>
/// The YAML of this library against the YAML of <c>@ariadne/core</c>, written by the CLI (<c>ariadne convert</c>) for the
/// same model. The CLI is <c>apps/cli/dist/ariadne.mjs</c> (<c>pnpm --filter @ariadne/cli build</c>). CI builds it and sets
/// <c>ARIADNE_CLI_REQUIRED=1</c>; without it a missing CLI skips the comparison, so that <c>dotnet test</c> works alone. <c>ARIADNE_SEED</c> picks another run.
/// </summary>
public class TypeScriptWriterTests
{
    private const int Diagrams = 300;

    [Fact]
    public void The_yaml_of_awkward_diagrams_is_what_the_typescript_writer_writes() => Compare(whitespaceOnly: false);

    [Fact]
    public void The_yaml_of_diagrams_with_blank_texts_is_what_the_typescript_writer_writes() => Compare(whitespaceOnly: true);

    private static void Compare(bool whitespaceOnly)
    {
        var cli = Path.Combine(TestFiles.RepositoryRoot(), "apps", "cli", "dist", "ariadne.mjs");
        if (!File.Exists(cli))
        {
            Assert.False(Environment.GetEnvironmentVariable("ARIADNE_CLI_REQUIRED") == "1", $"{cli} is missing: run `pnpm --filter @ariadne/cli build`.");
            return;
        }

        var dir = Directory.CreateTempSubdirectory("ariadne-yaml-");
        try
        {
            var input = Directory.CreateDirectory(Path.Combine(dir.FullName, "in"));
            var output = Directory.CreateDirectory(Path.Combine(dir.FullName, "out"));
            var generator = new AwkwardDiagrams(int.TryParse(Environment.GetEnvironmentVariable("ARIADNE_SEED"), out var seed) ? seed : 20261116, whitespaceOnly);
            var models = new List<SagaDiagram>();
            for (var i = 0; i < Diagrams; i++)
            {
                // The model as the JSON reader reads it: what the TypeScript reader reads from this JSON is the same.
                var model = SagaDiagram.ParseJson(generator.Next().ToJson());
                models.Add(model);
                File.WriteAllText(Path.Combine(input.FullName, $"d{i:000}.saga.json"), model.ToJson());
            }

            Convert(cli, input.FullName, output.FullName);

            for (var i = 0; i < Diagrams; i++)
            {
                var typeScript = File.ReadAllText(Path.Combine(output.FullName, $"d{i:000}.saga.yaml"));
                Assert.True(typeScript == models[i].ToYaml(), $"diagram {i}:\n--- TypeScript\n{typeScript}\n--- .NET\n{models[i].ToYaml()}");

                SagaDiagram back;
                try
                {
                    back = SagaDiagramYaml.ParseYaml(typeScript);
                }
                catch (DiagramFormatException e)
                {
                    throw new InvalidOperationException($"diagram {i} is not read back: {e.Message}\n{typeScript}", e);
                }

                if (!whitespaceOnly)
                {
                    Assert.Equal(models[i].ToJson(), back.ToJson());
                }
            }
        }
        finally
        {
            dir.Delete(recursive: true);
        }
    }

    private static void Convert(string cli, string input, string output)
    {
        var start = new ProcessStartInfo("node") { RedirectStandardError = true, RedirectStandardOutput = true };
        start.ArgumentList.Add(cli);
        start.ArgumentList.Add("convert");
        foreach (var file in Directory.GetFiles(input, "*.saga.json").OrderBy(f => f, StringComparer.Ordinal))
        {
            start.ArgumentList.Add(file);
        }

        start.ArgumentList.Add("--to");
        start.ArgumentList.Add("yaml");
        start.ArgumentList.Add("-o");
        start.ArgumentList.Add(output);
        using var process = Process.Start(start)!;
        var error = process.StandardError.ReadToEndAsync();
        _ = process.StandardOutput.ReadToEndAsync();
        Assert.True(process.WaitForExit(120_000), "ariadne convert did not finish");
        Assert.True(process.ExitCode == 0, $"ariadne convert failed ({process.ExitCode}): {error.Result}");
    }
}
