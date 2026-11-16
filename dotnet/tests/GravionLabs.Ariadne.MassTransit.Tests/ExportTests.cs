using System;
using System.Collections.Generic;
using System.Linq;
using MassTransit;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class ExportTests
{
    /// <summary>The six state machines of samples/library and the checked-in diagram of each (<c>ariadne convert --to json</c>).</summary>
    public static TheoryData<string, string> Library() => new()
    {
        { nameof(Acme.Orders.OrderFulfilmentStateMachine), "order-fulfilment.saga.json" },
        { nameof(Acme.Payments.PaymentRetriesStateMachine), "payment-retries.saga.json" },
        { nameof(Acme.Accounts.CustomerOnboardingStateMachine), "customer-onboarding.saga.json" },
        { nameof(Acme.Travel.TripBookingStateMachine), "trip-booking.saga.json" },
        { nameof(Acme.Lending.LoanApplicationStateMachine), "loan-application.saga.json" },
        { nameof(Acme.Tenants.TenantProvisioningStateMachine), "tenant-provisioning.saga.json" },
    };

    internal static SagaDiagram Export(string className) => className switch
    {
        nameof(Acme.Orders.OrderFulfilmentStateMachine) => new Acme.Orders.OrderFulfilmentStateMachine().ToAriadne(),
        nameof(Acme.Payments.PaymentRetriesStateMachine) => new Acme.Payments.PaymentRetriesStateMachine().ToAriadne(),
        nameof(Acme.Accounts.CustomerOnboardingStateMachine) => new Acme.Accounts.CustomerOnboardingStateMachine().ToAriadne(),
        nameof(Acme.Travel.TripBookingStateMachine) => new Acme.Travel.TripBookingStateMachine().ToAriadne(),
        nameof(Acme.Lending.LoanApplicationStateMachine) => new Acme.Lending.LoanApplicationStateMachine().ToAriadne(),
        nameof(Acme.Tenants.TenantProvisioningStateMachine) => new Acme.Tenants.TenantProvisioningStateMachine().ToAriadne(),
        _ => throw new ArgumentOutOfRangeException(nameof(className)),
    };

    private static List<string> Nodes(SagaDiagram d) =>
        d.Nodes.Select(n => $"{n.Id} {n.Type} {n.Name} ignores=[{string.Join(",", n.Ignores)}]").ToList();

    /// <summary>
    /// The transitions, sorted. The order of the edges of a checked-in diagram is the order of the <c>During</c> calls in
    /// the code; a built machine holds the handlers per state, so its order is by state (documented on
    /// <see cref="StateMachineExtensions.ToAriadne"/>). A routing slip is called by its name in the checked-in diagram
    /// (<c>Provision.Completed</c>); the itinerary is built inside a delegate, so the exported event is the
    /// message (<c>RoutingSlipCompleted</c>).
    /// </summary>
    private static List<string> Edges(SagaDiagram d)
    {
        var slips = d.Nodes.SelectMany(n => n.RoutingSlips).Select(s => s.Name).ToList();
        string Event(string? name)
        {
            foreach (var slip in slips)
            {
                if (name == slip + ".Completed")
                {
                    return "RoutingSlipCompleted";
                }

                if (name == slip + ".Faulted")
                {
                    return "RoutingSlipFaulted";
                }
            }

            return name!;
        }

        return d.Edges
            .Select(e => $"{e.Source} -> {e.Target} on {Event(e.Event)} guarded={e.Guard is not null}")
            .OrderBy(e => e, StringComparer.Ordinal)
            .ToList();
    }

    [Theory]
    [MemberData(nameof(Library))]
    public void The_states_events_and_transitions_of_a_library_saga_are_those_of_its_checked_in_diagram(string className, string golden)
    {
        var expected = SagaDiagram.ParseJson(TestFiles.Golden(golden));

        var exported = Export(className);

        Assert.Equal(string.Join("\n", Nodes(expected)), string.Join("\n", Nodes(exported)));
        Assert.Equal(string.Join("\n", Edges(expected)), string.Join("\n", Edges(exported)));
    }

    [Theory]
    [MemberData(nameof(Library))]
    public void The_saga_block_comes_from_the_types(string className, string golden)
    {
        var expected = SagaDiagram.ParseJson(TestFiles.Golden(golden)).Saga!;

        var saga = Export(className).Saga!;

        Assert.Equal(expected.ClassName, saga.ClassName);
        Assert.Equal(expected.Namespace, saga.Namespace);
        Assert.Equal(expected.InstanceType, saga.InstanceType);
        Assert.Equal(expected.StateProperty, saga.StateProperty);
    }

    [Theory]
    [MemberData(nameof(Library))]
    public void The_name_is_the_class_name_without_StateMachine(string className, string golden)
    {
        Assert.NotNull(golden);

        Assert.Equal(className.Replace("StateMachine", string.Empty, StringComparison.Ordinal), Export(className).Name);
    }

    [Theory]
    [MemberData(nameof(Library))]
    public void Two_exports_of_the_same_machine_are_identical(string className, string golden)
    {
        Assert.NotNull(golden);

        var first = Export(className);
        var second = Export(className);

        Assert.Equal(first.ToJson(), second.ToJson());
        Assert.Equal(
            first.Warnings.Select(w => w.ToString()),
            second.Warnings.Select(w => w.ToString()));
    }

    [Theory]
    [MemberData(nameof(Library))]
    public void An_exported_diagram_is_a_valid_diagram(string className, string golden)
    {
        Assert.NotNull(golden);

        var json = Export(className).ToJson();

        Assert.Equal(json, SagaDiagram.ParseJson(json).ToJson());
    }

    [Fact]
    public void A_machine_behind_its_own_base_class_is_read()
    {
        var diagram = new Insurance.Claims.ClaimStateMachine().ToAriadne();

        Assert.Equal("Claim", diagram.Name);
        Assert.Equal("ClaimStateMachine", diagram.Saga!.ClassName);
        Assert.Equal("Insurance.Claims", diagram.Saga.Namespace);
        Assert.Equal("ClaimState", diagram.Saga.InstanceType);
        Assert.Equal("CurrentState", diagram.Saga.StateProperty);
        Assert.Equal(
            new[]
            {
                "start-1 Start Initial ignores=[]",
                "state-assessing State Assessing ignores=[]",
                "state-paying State Paying ignores=[Assessed]",
                "end-1 End Final ignores=[]",
                "any-1 Any Any state ignores=[]",
            },
            Nodes(diagram));
        Assert.Equal(
            new[]
            {
                "any-1 -> end-1 on Withdrawn guarded=False",
                "start-1 -> state-assessing on Filed guarded=False",
                "state-assessing -> state-paying on Assessed guarded=False",
                "state-paying -> end-1 on Paid guarded=False",
            },
            Edges(diagram));
        Assert.Equal(
            new[] { ("Filed", "ClaimFiled"), ("Assessed", "ClaimAssessed"), ("Paid", "ClaimPaid"), ("Withdrawn", "ClaimWithdrawn") },
            diagram.Events.Select(e => (e.Name, e.MessageType!)));
    }

    [Fact]
    public void A_machine_with_handlers_built_in_extension_methods_is_read()
    {
        var diagram = new Logistics.Parcels.ParcelStateMachine().ToAriadne();

        Assert.Equal(
            new[]
            {
                "any-1 -> end-1 on Lost guarded=False",
                "start-1 -> state-in-transit on Registered guarded=False",
                "state-in-transit -> state-out-for-delivery on Scanned guarded=False",
                "state-out-for-delivery -> end-1 on Delivered guarded=False",
            },
            Edges(diagram));
        Assert.Equal(
            new[] { ("Registered", "ParcelRegistered"), ("Scanned", "ParcelScanned"), ("Delivered", "ParcelDelivered"), ("Lost", "ParcelLost") },
            diagram.Events.Select(e => (e.Name, e.MessageType!)));
    }

    [Fact]
    public void DuringAny_is_the_transitions_of_the_one_any_node_and_says_it_is_inferred()
    {
        var diagram = new Acme.Orders.OrderFulfilmentStateMachine().ToAriadne();

        Assert.Single(diagram.Nodes, n => n.Type == NodeType.Any);
        var edge = Assert.Single(diagram.Edges, e => e.Source == "any-1");
        Assert.Equal("OrderCancelled", edge.Event);
        Assert.Equal("state-cancelling", edge.Target);
        Assert.Contains(diagram.Warnings, w => w.Construct == "DuringAny" && w.Event == "OrderCancelled");
    }

    [Fact]
    public void A_transition_that_stays_in_a_state_is_a_loop()
    {
        var diagram = new StayingStateMachine().ToAriadne();

        var loop = Assert.Single(diagram.Edges, e => e.Source == e.Target);
        Assert.Equal("state-waiting", loop.Source);
        Assert.Equal("PingEvent", loop.Event);
    }

    [Fact]
    public void What_cannot_be_read_is_a_warning_with_construct_state_and_event_never_thrown()
    {
        var diagram = new StayingStateMachine().ToAriadne();

        var then = Assert.Single(diagram.Warnings, w => w.Construct == "Then");
        Assert.Equal("Waiting", then.State);
        Assert.Equal("PingEvent", then.Event);
        Assert.Contains(diagram.Warnings, w => w.Construct == "If" && w.State == "Waiting" && w.Event == "Decide");
        Assert.Contains(diagram.Warnings, w => w.Construct == "Catch" && w.Event == "Decide");
        Assert.Contains(diagram.Warnings, w => w.Construct == "WhenLeave" && w.State == "Waiting");
        Assert.Contains(diagram.Warnings, w => w.Construct == "Correlation" && w.Event == "Decide");
    }

    [Fact]
    public void The_transitions_of_a_condition_have_a_guard_marker_instead_of_a_guessed_text()
    {
        var diagram = new StayingStateMachine().ToAriadne();

        var guarded = diagram.Edges.Where(e => e.Event == "Decide").ToList();
        Assert.Equal(new[] { "state-done" }, guarded.Select(e => e.Target));
        Assert.All(guarded, e => Assert.Equal("condition in code", e.Guard));
    }

    [Fact]
    public void A_null_machine_is_refused()
    {
        Assert.Throws<ArgumentNullException>(() => StateMachineExtensions.ToAriadne<StayingState>(null!));
    }

    [Fact]
    public void A_composite_event_is_a_join()
    {
        var diagram = new Acme.Lending.LoanApplicationStateMachine().ToAriadne();

        var join = Assert.Single(diagram.Nodes, n => n.Type == NodeType.Join);
        Assert.Equal("join-checks-completed", join.Id);
        Assert.Equal(3, diagram.Edges.Count(e => e.Target == join.Id));
        Assert.Single(diagram.Edges, e => e.Source == join.Id);
    }

    internal sealed class StayingState : SagaStateMachineInstance
    {
        public Guid CorrelationId { get; set; }

        public int CurrentState { get; set; }
    }

    internal sealed record Ping(Guid Id);

    internal sealed record Decide(Guid Id, bool Yes);

    internal sealed class StayingStateMachine : MassTransitStateMachine<StayingState>
    {
        public StayingStateMachine()
        {
            InstanceState(x => x.CurrentState, Waiting, Done);

            Event(() => PingEvent, x => x.CorrelateById(c => c.Message.Id));
            Event(() => Decide, x => x.CorrelateBy((s, c) => s.CorrelationId == c.Message.Id));

            Initially(When(PingEvent).TransitionTo(Waiting));
            During(
                Waiting,
                When(PingEvent).Then(_ => { }),
                When(Decide)
                    .If(c => c.Message.Yes, then => then.TransitionTo(Done))
                    .Catch<Exception>(ex => ex.TransitionTo(Waiting)));
            WhenLeave(Waiting, b => b.Then(_ => { }));
        }

        public State Waiting { get; private set; } = null!;

        public State Done { get; private set; } = null!;

        public Event<Ping> PingEvent { get; private set; } = null!;

        public Event<Decide> Decide { get; private set; } = null!;
    }
}
