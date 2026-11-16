using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace GravionLabs.Ariadne.MassTransit.Tests;

internal static class TestFiles
{
    /// <summary>The golden JSON diagrams: <c>ariadne convert --to json</c> of every diagram of samples/ and docs/examples.</summary>
    internal static IEnumerable<object[]> Goldens() =>
        Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "golden"), "*.saga.json")
            .Select(Path.GetFileName)
            .OrderBy(name => name, StringComparer.Ordinal)
            .Select(name => new object[] { name! });

    internal static string Golden(string name) => File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "golden", name));

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
