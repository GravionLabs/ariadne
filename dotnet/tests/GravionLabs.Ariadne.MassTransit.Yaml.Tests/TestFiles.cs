using System;
using System.IO;

namespace GravionLabs.Ariadne.MassTransit.Yaml.Tests;

internal static class TestFiles
{
    internal static string RepositoryRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "docs", "specs", "saga.schema.json")))
        {
            dir = dir.Parent;
        }

        return dir?.FullName ?? throw new InvalidOperationException("docs/specs/saga.schema.json not found above " + AppContext.BaseDirectory);
    }
}
