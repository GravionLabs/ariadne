using System;
using MassTransit;

namespace GravionLabs.Ariadne.MassTransit;

/// <summary>Reads a built MassTransit state machine as an Ariadne diagram.</summary>
public static class StateMachineExtensions
{
    /// <summary>
    /// Reads the structure of a built saga state machine: its states, events and transitions. Nothing is
    /// executed and nothing is guessed: what cannot be read from the built machine (the code of <c>Then</c>, the text
    /// of a condition, a correlation expression) is left out and listed in <see cref="SagaDiagram.Warnings"/>.
    /// </summary>
    /// <remarks>
    /// <para>The result is deterministic: two exports of the same machine are identical. Nodes are in this order: the
    /// initial state (<c>start-1</c>), the declared states in the order of <c>machine.States</c> (<c>state-&lt;kebab-name&gt;</c>),
    /// the final state (<c>end-1</c>, only when a transition enters it), the <c>any</c> node (<c>any-1</c>, only when
    /// there are transitions for it) and the joins of composite events (<c>join-&lt;kebab-name&gt;</c>). Edges (<c>edge-1…</c>)
    /// follow the nodes: by the state they leave, in the order MassTransit holds the handlers of that state (the order
    /// of the code), the transitions of the <c>any</c> node last.</para>
    /// <para><c>DuringAny</c> is copied by MassTransit into every state and cannot be told from the same
    /// <c>During</c> written for each state. A handler that every state except the initial and the final one has, with
    /// the same transitions, becomes a transition of the <c>any</c> node, with a warning.</para>
    /// </remarks>
    /// <typeparam name="TInstance">The saga instance type.</typeparam>
    /// <param name="stateMachine">A built state machine, e.g. <c>new OrderStateMachine()</c>.</param>
    /// <returns>The diagram, with the warnings.</returns>
    public static SagaDiagram ToAriadne<TInstance>(this StateMachine<TInstance> stateMachine)
        where TInstance : class, SagaStateMachineInstance
    {
        if (stateMachine is null)
        {
            throw new ArgumentNullException(nameof(stateMachine));
        }

        return DiagramBuilder.Build(stateMachine);
    }
}
