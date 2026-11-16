using System;
using System.Collections.Generic;
using System.Linq;
using MassTransit;
using MassTransit.Courier.Contracts;
using Xunit;

namespace GravionLabs.Ariadne.MassTransit.Tests;

public class ActivityTests
{
    private const string Guard = "condition in code";

    private static SagaDiagram Diagram() => new Machine().ToAriadne();

    private static DiagramNode Node(SagaDiagram d, string name) => Assert.Single(d.Nodes, n => n.Name == name);

    private static List<string> Activities(DiagramNode n) => n.Activities.Select(a => $"{a.Kind} {a.Name}").ToList();

    [Fact]
    public void Send_and_Publish_are_activities_of_the_state_a_transition_leads_into_named_by_the_message_type()
    {
        var node = Node(Diagram(), "Working");

        Assert.Equal(new[] { "Command StartWork", "Event WorkStarted" }, Activities(node));
    }

    [Fact]
    public void An_activity_that_two_transitions_into_a_state_share_is_listed_once_after_those_of_WhenEnter()
    {
        var node = Node(Diagram(), "Reviewing");

        Assert.Equal(new[] { "Event ReviewOpened", "Command AssignReviewer", "Command NotifyOwner" }, Activities(node));
    }

    [Fact]
    public void A_request_is_a_request_of_the_state_with_its_timeout()
    {
        var node = Node(Diagram(), "Checking");

        var request = Assert.Single(node.Requests);
        Assert.Equal("Validate", request.Name);
        Assert.Equal("30s", request.Timeout);
    }

    [Fact]
    public void The_replies_of_a_request_are_transitions_on_the_events_of_the_format()
    {
        var diagram = Diagram();

        var events = diagram.Edges.Where(e => e.Event is not null && e.Event.StartsWith("Validate.", StringComparison.Ordinal)).Select(e => e.Event).OrderBy(e => e, StringComparer.Ordinal).ToList();

        Assert.Equal(new[] { "Validate.Completed", "Validate.Faulted", "Validate.TimeoutExpired" }, events);
    }

    [Fact]
    public void A_schedule_is_a_timer_with_its_delay_and_an_unschedule_one_without()
    {
        var diagram = Diagram();

        var working = Node(diagram, "Working");
        var timer = Assert.Single(working.Timers);
        Assert.Equal((TimerAction.Schedule, "Reminder", "15m"), (timer.Action, timer.Name, timer.Delay));

        var checking = Node(diagram, "Checking");
        var unschedule = Assert.Single(checking.Timers);
        Assert.Equal((TimerAction.Unschedule, "Reminder", (string?)null), (unschedule.Action, unschedule.Name, unschedule.Delay));
    }

    [Fact]
    public void A_delay_computed_in_code_is_a_timer_without_a_delay_and_a_warning()
    {
        var diagram = Diagram();

        var timer = Assert.Single(Node(diagram, "Reviewing").Timers);
        Assert.Equal("Reminder", timer.Name);
        Assert.Null(timer.Delay);
        Assert.Contains(diagram.Warnings, w => w.Construct == "Schedule" && w.State == "Idle" && w.Event == "ReviewE");
    }

    [Fact]
    public void The_activities_of_a_branch_belong_to_the_state_the_branch_leads_into()
    {
        var diagram = Diagram();

        Assert.Equal(new[] { "Command Approve" }, Activities(Node(diagram, "Approved")));
        Assert.Equal(new[] { "Command Reject" }, Activities(Node(diagram, "Rejected")));
        Assert.Equal(new[] { "Event Decided" }, Activities(Node(diagram, "Archived")).Take(1));
    }

    [Fact]
    public void The_branches_of_IfElse_are_guarded_transitions_and_the_way_out_of_an_If_is_the_negation()
    {
        var diagram = Diagram();

        string GuardOf(string target) => Assert.Single(diagram.Edges, e => e.Event == "DecideE" && e.Target == "state-" + target).Guard!;

        Assert.Equal(Guard, GuardOf("approved"));
        Assert.Equal("!(" + Guard + ")", GuardOf("rejected"));
        Assert.Equal(Guard, Assert.Single(diagram.Edges, e => e.Event == "CheckE" && e.Source == "state-idle" && e.Target == "state-checking").Guard);
        Assert.Equal("!(" + Guard + ")", Assert.Single(diagram.Edges, e => e.Event == "CheckE" && e.Source == "state-idle" && e.Target == "state-reviewing").Guard);
    }

    [Fact]
    public void Nested_conditions_join_their_guards_and_a_branch_without_a_transition_is_a_warning()
    {
        var diagram = new Nested().ToAriadne();

        string GuardTo(string target) => Assert.Single(diagram.Edges, e => e.Target == "state-" + target).Guard!;

        Assert.Equal(Guard + " && " + Guard, GuardTo("c"));
        Assert.Equal(Guard + " && !(" + Guard + ")", GuardTo("d"));
        Assert.Contains(diagram.Warnings, w => w.Construct == "If" && w.Event == "Go" && w.Message.Contains("Lost", StringComparison.Ordinal));
        Assert.DoesNotContain(diagram.Nodes.SelectMany(n => n.Activities), a => a.Name == "Lost");
    }

    [Fact]
    public void A_guard_is_marked_in_a_warning_as_not_the_source_text()
    {
        var warning = Assert.Single(Diagram().Warnings, w => w.Construct == "If" && w.Event == "DecideE");

        Assert.Contains("not source text", warning.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Activities_on_the_way_to_the_final_state_and_into_a_join_are_a_warning_not_a_guess()
    {
        var diagram = Diagram();

        Assert.Contains(diagram.Warnings, w => w.Construct == "Finalize" && w.Event == "CloseE" && w.Message.Contains("Notify", StringComparison.Ordinal));
        Assert.Contains(diagram.Warnings, w => w.Construct == "CompositeEvent" && w.Event == "PartAE" && w.Message.Contains("Audit", StringComparison.Ordinal));
        Assert.All(diagram.Nodes.Where(n => n.Type != NodeType.State), n => Assert.Empty(n.Activities));
    }

    [Fact]
    public void An_event_that_keeps_the_saga_in_its_state_shows_its_activities_on_that_state_with_a_warning()
    {
        var diagram = Diagram();

        Assert.Contains(Activities(Node(diagram, "Idle")), a => a == "Command Ping");
        Assert.Contains(diagram.Warnings, w => w.Construct == "Stays" && w.State == "Idle" && w.Event == "PokeE");
    }

    [Fact]
    public void Activities_in_the_final_state_and_the_itinerary_of_a_routing_slip_are_a_warning()
    {
        var diagram = Diagram();

        Assert.Contains(diagram.Warnings, w => w.Construct == "Finally" && w.Message.Contains("Goodbye", StringComparison.Ordinal));
        Assert.Contains(diagram.Warnings, w => w.Construct == "RoutingSlip" && w.Event == "RoutingSlipCompleted");
    }

    [Fact]
    public void Every_unreadable_construct_is_one_warning_with_its_state_and_event()
    {
        var diagram = Diagram();

        var then = Assert.Single(diagram.Warnings, w => w.Construct == "Then");
        Assert.Equal(("Idle", "PokeE"), (then.State, then.Event));
        Assert.Equal(diagram.Warnings.Count, diagram.Warnings.Select(w => w.ToString()).Distinct(StringComparer.Ordinal).Count());
    }

    internal sealed class Job : SagaStateMachineInstance
    {
        public Guid CorrelationId { get; set; }

        public int CurrentState { get; set; }

        public Guid? ReminderId { get; set; }

        public Guid? ValidateId { get; set; }
    }

    internal sealed record Start(Guid Id);

    internal sealed record Review(Guid Id);

    internal sealed record Check(Guid Id);

    internal sealed record Decide(Guid Id, bool Yes);

    internal sealed record Poke(Guid Id);

    internal sealed record PartA(Guid Id);

    internal sealed record PartB(Guid Id);

    internal sealed record Close(Guid Id);

    internal sealed record Archive(Guid Id);

    internal sealed record StartWork(Guid Id);

    internal sealed record WorkStarted(Guid Id);

    internal sealed record ReviewOpened(Guid Id);

    internal sealed record AssignReviewer(Guid Id);

    internal sealed record NotifyOwner(Guid Id);

    internal sealed record Approve(Guid Id);

    internal sealed record Reject(Guid Id);

    internal sealed record Decided(Guid Id);

    internal sealed record Notify(Guid Id);

    internal sealed record Audit(Guid Id);

    internal sealed record Ping(Guid Id);

    internal sealed record Goodbye(Guid Id);

    internal sealed record ReminderDue(Guid Id);

    internal sealed record Validation(Guid Id);

    internal sealed record ValidationResult(Guid Id);

    internal sealed record RoutingDone(Guid Id);

    internal sealed record Lost(Guid Id);

    internal sealed class Nested : MassTransitStateMachine<Job>
    {
        public Nested()
        {
            InstanceState(x => x.CurrentState, B, C, D);
            Event(() => Go, x => x.CorrelateById(c => c.Message.Id));
            Initially(When(Go).TransitionTo(B));
            During(
                B,
                When(Go)
                    .If(
                        c => c.Saga.CurrentState > 0,
                        t => t
                            .IfElse(
                                c => c.Saga.CurrentState > 1,
                                u => u.TransitionTo(C),
                                u => u.Publish(c => new Lost(c.Saga.CorrelationId)))
                            .TransitionTo(D)));
        }

        public State B { get; private set; } = null!;

        public State C { get; private set; } = null!;

        public State D { get; private set; } = null!;

        public Event<Start> Go { get; private set; } = null!;
    }

    internal sealed class Machine : MassTransitStateMachine<Job>
    {
        public Machine()
        {
            InstanceState(x => x.CurrentState, Idle, Working, Checking, Reviewing, Approved, Rejected, Archived, Joining);

            Event(() => StartE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => ReviewE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => CheckE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => DecideE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => PokeE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => PartAE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => PartBE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => CloseE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => ArchiveE, x => x.CorrelateById(c => c.Message.Id));
            Event(() => RoutingSlipCompleted, x => x.CorrelateById(c => c.Message.TrackingNumber));
            CompositeEvent(() => BothParts, x => x.CurrentState, PartAE, PartBE);

            Schedule(() => Reminder, x => x.ReminderId, s =>
            {
                s.Delay = TimeSpan.FromMinutes(15);
                s.Received = e => e.CorrelateById(c => c.Message.Id);
            });
            Request(() => Validate, x => x.ValidateId, r => r.Timeout = TimeSpan.FromSeconds(30));

            Initially(
                When(StartE)
                    .Send(c => new StartWork(c.Saga.CorrelationId))
                    .Publish(c => new WorkStarted(c.Saga.CorrelationId))
                    .Schedule(Reminder, c => new ReminderDue(c.Saga.CorrelationId))
                    .TransitionTo(Working));

            During(
                Idle,
                When(ReviewE)
                    .Publish(c => new ReviewOpened(c.Saga.CorrelationId))
                    .Send(c => new AssignReviewer(c.Saga.CorrelationId))
                    .Schedule(Reminder, c => new ReminderDue(c.Saga.CorrelationId), c => TimeSpan.FromSeconds(c.Saga.CurrentState + 1))
                    .TransitionTo(Reviewing),
                When(PokeE)
                    .Send(c => new Ping(c.Saga.CorrelationId))
                    .Then(_ => { }),
                When(CheckE)
                    .If(c => c.Saga.CurrentState > 1, then => then.TransitionTo(Checking))
                    .TransitionTo(Reviewing));

            During(
                Working,
                When(ReviewE)
                    .Send(c => new NotifyOwner(c.Saga.CorrelationId))
                    .Publish(c => new ReviewOpened(c.Saga.CorrelationId))
                    .TransitionTo(Reviewing),
                When(CheckE)
                    .Unschedule(Reminder)
                    .Request(Validate, c => new Validation(c.Saga.CorrelationId))
                    .TransitionTo(Checking),
                When(PartAE)
                    .Send(c => new Audit(c.Saga.CorrelationId)),
                When(PartBE),
                When(BothParts)
                    .TransitionTo(Archived));

            During(
                Checking,
                When(Validate.Completed).TransitionTo(Reviewing),
                When(Validate.Faulted).TransitionTo(Rejected),
                When(Validate.TimeoutExpired).TransitionTo(Rejected));

            During(
                Reviewing,
                When(DecideE)
                    .IfElse(
                        c => c.Message.Yes,
                        yes => yes.Send(c => new Approve(c.Saga.CorrelationId)).TransitionTo(Approved),
                        no => no.Send(c => new Reject(c.Saga.CorrelationId)).TransitionTo(Rejected)),
                When(CloseE)
                    .Send(c => new Notify(c.Saga.CorrelationId))
                    .Finalize());

            During(
                Approved,
                When(ArchiveE)
                    .Publish(c => new Decided(c.Saga.CorrelationId))
                    .TransitionTo(Archived));

            During(Checking, When(RoutingSlipCompleted).TransitionTo(Approved));

            WhenEnter(Reviewing, b => b.Publish(c => new ReviewOpened(c.Saga.CorrelationId)));
            Finally(b => b.Publish(c => new Goodbye(c.Saga.CorrelationId)));
        }

        public State Idle { get; private set; } = null!;

        public State Working { get; private set; } = null!;

        public State Checking { get; private set; } = null!;

        public State Reviewing { get; private set; } = null!;

        public State Approved { get; private set; } = null!;

        public State Rejected { get; private set; } = null!;

        public State Archived { get; private set; } = null!;

        public State Joining { get; private set; } = null!;

        public Event<Start> StartE { get; private set; } = null!;

        public Event<Review> ReviewE { get; private set; } = null!;

        public Event<Check> CheckE { get; private set; } = null!;

        public Event<Decide> DecideE { get; private set; } = null!;

        public Event<Poke> PokeE { get; private set; } = null!;

        public Event<PartA> PartAE { get; private set; } = null!;

        public Event<PartB> PartBE { get; private set; } = null!;

        public Event<Close> CloseE { get; private set; } = null!;

        public Event<Archive> ArchiveE { get; private set; } = null!;

        public Event<RoutingSlipCompleted> RoutingSlipCompleted { get; private set; } = null!;

        public Event BothParts { get; private set; } = null!;

        public Schedule<Job, ReminderDue> Reminder { get; private set; } = null!;

        public Request<Job, Validation, ValidationResult> Validate { get; private set; } = null!;
    }
}
