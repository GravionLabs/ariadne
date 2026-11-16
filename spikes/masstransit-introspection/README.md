# MassTransit introspection spike (#504)

Throwaway project. It builds the six state machines of `samples/library` plus one more (`Coverage.cs`, the
constructs the samples do not use) and reads each through the graph, the probe and a state machine visitor. The
result is written up in [`docs/specs/masstransit-introspection.md`](../../docs/specs/masstransit-introspection.md).
It is not part of any build, test or CI run.

```sh
cd spikes/masstransit-introspection
dotnet build -p:MassTransitVersion=8.5.12      # or 8.0.0, 9.0.0, 9.2.6
dotnet bin/Debug/net8.0/Spike.dll out          # per machine: .graph.txt, .probe.json, .visitor.txt, .machine.txt
dotnet bin/Debug/net8.0/Spike.dll --corr       # the correlations of a machine
```

`Program.cs` is the reader (`DumpVisitor` is the visitor). The output is the same for 8.5.12, 9.0.0 and 9.2.6.
Needs a .NET SDK 8 or later; the project rolls forward to the installed runtime.
