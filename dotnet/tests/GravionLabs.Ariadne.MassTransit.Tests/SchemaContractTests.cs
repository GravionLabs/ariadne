using System;
using System.IO;
using System.Text.Json;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class SchemaContractTests
{
    [Fact]
    public void Format_version_equals_the_const_of_the_shared_schema()
    {
        using var schema = JsonDocument.Parse(File.ReadAllText(Path.Combine(RepositoryRoot(), "docs", "specs", "saga.schema.json")));

        var version = schema.RootElement.GetProperty("properties").GetProperty("version").GetProperty("const").GetInt32();

        Assert.Equal(AriadneFormat.Version, version);
    }

    private static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "specs", "saga.schema.json")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("docs/specs/saga.schema.json not found above " + AppContext.BaseDirectory);
    }
}
