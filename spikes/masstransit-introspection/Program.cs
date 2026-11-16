// Throwaway spike (#504): what a built MassTransit state machine exposes.
// Reads the six state machines of samples/library through the graph, the probe and a visitor.
// Usage: dotnet run -- [outDir]   (-p:MassTransitVersion=9.2.6 for another version)
using System.Text;
using System.Text.Json;
using MassTransit;
using MassTransit.SagaStateMachine;

var outDir = args.FirstOrDefault(a => !a.StartsWith("--")) ?? "out";
Directory.CreateDirectory(outDir);
var machines = new StateMachine[]
{
    new Acme.Orders.OrderFulfilmentStateMachine(),
    new Acme.Payments.PaymentRetriesStateMachine(),
    new Acme.Accounts.CustomerOnboardingStateMachine(),
    new Acme.Travel.TripBookingStateMachine(),
    new Acme.Lending.LoanApplicationStateMachine(),
    new Acme.Tenants.TenantProvisioningStateMachine(),
    new Spike.Coverage.CoverageStateMachine(),
};
if (args.Contains("--corr")) {
  var m = new Spike.Coverage.CoverageStateMachine();
  var prop = m.GetType().GetProperty("Correlations");
  Console.WriteLine("Correlations property: " + prop);
  foreach (var c in (System.Collections.IEnumerable)prop!.GetValue(m)!) {
    Console.WriteLine(c.GetType().FullName);
    foreach (var pr in c.GetType().GetProperties()) { var v = pr.GetValue(c); Console.WriteLine($"  {pr.Name} = {v}"); }
  }
  var lm = new Acme.Lending.LoanApplicationStateMachine();
  foreach (var c in (System.Collections.IEnumerable)lm.GetType().GetProperty("Correlations")!.GetValue(lm)!) Console.WriteLine("loan: "+c.GetType().Name+" "+string.Join(", ", c.GetType().GetProperties().Select(p => p.Name+"="+p.GetValue(c))));
  // ignored events per state
  foreach (var st in m.States) {
    var ev = ((dynamic)st).Events; 
    Console.WriteLine($"State<T>.Events of {st.Name}: " + string.Join(",", ((IEnumerable<Event>)ev).Select(e => e.Name)));
  }
  return 0;
}
if (args.Contains("--ext")) {
  foreach (var t in typeof(MassTransitStateMachine<>).Assembly.GetTypes().Concat(typeof(State).Assembly.GetTypes()).Where(t => t.IsSealed && t.IsAbstract && t.IsPublic)) foreach (var m in t.GetMethods().Where(m => m.Name.Contains("Switch") || m.Name.Contains("Catch") || m.Name.Contains("IfAsync")|| m.Name.Contains("Respond"))) Console.WriteLine(t.Name + "::" + m);
  return 0;
}
if (args.Contains("--types")) {
  var a = typeof(MassTransitStateMachine<>).Assembly;
  Explore.Types(a.GetType("MassTransit.SagaStateMachine.TransitionActivity`1")!, a.GetType("MassTransit.SagaStateMachine.ConditionActivity`2")!,
    a.GetType("MassTransit.SagaStateMachine.UnscheduleActivity`1")!, a.GetType("MassTransit.SagaStateMachine.AsyncActivity`2")!,
    a.GetType("MassTransit.SagaStateMachine.SendActivity`3")!, a.GetType("MassTransit.SagaStateMachine.CompositeEventActivity`1")!,
    a.GetType("MassTransit.SagaStateMachine.ScheduleActivity`3")!, a.GetType("MassTransit.SagaStateMachine.RequestActivity`4")!,
    a.GetType("MassTransit.SagaStateMachine.CatchFaultActivity`2")!, a.GetType("MassTransit.EventCorrelation")! ?? typeof(object));
  return 0;
}
var version = typeof(MassTransitStateMachine<>).Assembly.GetName().Version;
Console.WriteLine($"MassTransit assembly {version}, runtime {Environment.Version}");

foreach (var machine in machines)
{
    var name = machine.GetType().Name.Replace("StateMachine", "");
    Console.WriteLine($"## {name}: {machine.States.Count()} states, {machine.Events.Count()} events, instance {machine.InstanceType.Name}");

    // 1. Graph
    var sb = new StringBuilder();
    dynamic dyn = machine;
    var graph = (StateMachineGraph)GraphStateMachineExtensions.GetGraph(dyn);
    sb.AppendLine("# vertices");
    foreach (var v in graph.Vertices)
        sb.AppendLine($"{v.Title}\t{v.VertexType.Name}\ttarget={v.TargetType.Name}\tcomposite={v.IsComposite}");
    sb.AppendLine("# edges");
    foreach (var e in graph.Edges) sb.AppendLine($"{e.From.Title} -> {e.To.Title}");
    File.WriteAllText(Path.Combine(outDir, $"{name}.graph.txt"), sb.ToString());

    // 2. Probe
    var probe = ((IProbeSite)machine).GetProbeResult();
    File.WriteAllText(Path.Combine(outDir, $"{name}.probe.json"),
        JsonSerializer.Serialize(probe.Results, new JsonSerializerOptions { WriteIndented = true }));

    // 3. Visitor
    var visitor = new DumpVisitor();
    machine.Accept(visitor);
    File.WriteAllText(Path.Combine(outDir, $"{name}.visitor.txt"), visitor.Text.ToString());

    // 4. Plain properties of StateMachine
    var plain = new StringBuilder();
    plain.AppendLine($"name={machine.Name} instance={machine.InstanceType.FullName}");
    plain.AppendLine($"initial={machine.Initial.Name} final={machine.Final.Name}");
    foreach (var s in machine.States)
    {
        var next = machine.NextEvents(s).Select(e => e.Name);
        plain.AppendLine($"state {s.Name}: nextEvents=[{string.Join(", ", next)}]");
    }
    foreach (var ev in machine.Events)
    {
        var t = ev.GetType();
        var msg = t.IsGenericType ? t.GetGenericArguments()[0].Name : "(none)";
        plain.AppendLine($"event {ev.Name}: type={t.Name} message={msg} composite={machine.IsCompositeEvent(ev)}");
    }
    File.WriteAllText(Path.Combine(outDir, $"{name}.machine.txt"), plain.ToString());
}

return 0;

class DumpVisitor : StateMachineVisitor
{
    public readonly StringBuilder Text = new();
    int depth;
    void Line(string s) => Text.AppendLine(new string(' ', depth * 2) + s);
    static string Pretty(Type t) => t.IsGenericType
        ? t.Name.Split('`')[0] + "<" + string.Join(", ", t.GetGenericArguments().Select(Pretty)) + ">"
        : t.Name;

    public void Visit(State state, Action<State> next) { Line($"State {state.Name}"); depth++; next(state); depth--; }
    public void Visit(Event @event, Action<Event> next) { Line($"Event {@event.Name} [{Pretty(@event.GetType())}]"); depth++; next(@event); depth--; }
    public void Visit<TMessage>(Event<TMessage> @event, Action<Event<TMessage>> next) where TMessage : class { Line($"Event<{typeof(TMessage).Name}> {@event.Name}"); depth++; next(@event); depth--; }
    public void Visit(IStateMachineActivity activity) => Line($"Activity {Pretty(activity.GetType())}");
    public void Visit(IStateMachineActivity activity, Action<IStateMachineActivity> next) { Line($"Activity {Pretty(activity.GetType())}"); depth++; next(activity); depth--; }
    public void Visit<T>(IBehavior<T> behavior) where T : class, SagaStateMachineInstance => Line($"Behavior {Pretty(behavior.GetType())}");
    public void Visit<T>(IBehavior<T> behavior, Action<IBehavior<T>> next) where T : class, SagaStateMachineInstance { Line($"Behavior {Pretty(behavior.GetType())}"); depth++; next(behavior); depth--; }
    public void Visit<T, TMessage>(IBehavior<T, TMessage> behavior) where T : class, SagaStateMachineInstance where TMessage : class => Line($"Behavior<{typeof(TMessage).Name}> {Pretty(behavior.GetType())}");
    public void Visit<T, TMessage>(IBehavior<T, TMessage> behavior, Action<IBehavior<T, TMessage>> next) where T : class, SagaStateMachineInstance where TMessage : class { Line($"Behavior<{typeof(TMessage).Name}> {Pretty(behavior.GetType())}"); depth++; next(behavior); depth--; }
}