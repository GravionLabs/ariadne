#!/usr/bin/env bash
# Generates C# from every sample diagram and compiles it against MassTransit, so the generator
# cannot emit code that does not build. The library samples (samples/library) are compiled too, the
# hand-written C# of each and the C# generated for it, each on its own because they share a
# namespace. Needs the .NET SDK (CI installs it; it is not needed to develop Ariadne).
# Usage: scripts/compile-generated.sh [work-dir]
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="${1:-$(mktemp -d)}"
cli="$root/apps/cli/dist/ariadne.mjs"
[ -f "$cli" ] || { echo "Build the CLI first: pnpm --filter @ariadne/cli build" >&2; exit 2; }

rm -rf "$work"
mkdir -p "$work/generated"
cat > "$work/Generated.csproj" <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>disable</ImplicitUsings>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MassTransit" Version="8.*" />
  </ItemGroup>
</Project>
XML

count=0
for diagram in "$root"/docs/examples/*.saga.yaml "$root"/samples/sagas/*/*.saga.yaml; do
  name="$(basename "$diagram" .saga.yaml)"
  # One folder per diagram: every sample has its own namespace-less Contracts.cs.
  node "$cli" generate "$diagram" -o "$work/generated/$name" >/dev/null
  count=$((count + 1))
done
echo "Generated C# for $count diagrams; compiling…"
dotnet build "$work/Generated.csproj" --nologo -v q

# The library: every sample's hand-written C# and its generated C#, one project run for each folder.
mkdir -p "$work/library"
cat > "$work/library/Library.csproj" <<'XML'
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>false</TreatWarningsAsErrors>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="$(SampleDir)/*.cs" />
    <PackageReference Include="MassTransit" Version="8.*" />
  </ItemGroup>
</Project>
XML
built=0
for sample in "$root"/samples/library/*/; do
  name="$(basename "$sample")"
  for dir in "$sample" "$sample/generated"; do
    [ -d "$dir" ] || continue
    ls "$dir"/*.cs >/dev/null 2>&1 || continue
    echo "Compiling ${dir#"$root"/}…"
    dotnet build "$work/library/Library.csproj" --nologo -v q -p:SampleDir="$dir"
    built=$((built + 1))
  done
done
echo "Compiled $built library folders."
