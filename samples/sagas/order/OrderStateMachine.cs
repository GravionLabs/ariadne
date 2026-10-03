using MassTransit;

namespace Shop.Orders;

public class OrderState : SagaStateMachineInstance
{
    public Guid CorrelationId { get; set; }
    public string CurrentState { get; set; } = null!;
    public Guid? OrderId { get; set; }
}

public class OrderStateMachine : MassTransitStateMachine<OrderState>
{
    public OrderStateMachine()
    {
        InstanceState(x => x.CurrentState);

        Event(() => OrderSubmitted, x => x.CorrelateById(context => context.Message.OrderId));
        Event(() => StockReserved);
        Event(() => StockUnavailable);
        Event(() => PaymentCharged);
        Event(() => PaymentFailed);
        Event(() => OrderShipped);

        Initially(
            When(OrderSubmitted)
                .Send(context => new ReserveStock(context.Saga.CorrelationId))
                .TransitionTo(ReservingStock));

        During(ReservingStock,
            When(StockReserved)
                .Send(context => new ChargePayment(context.Saga.CorrelationId))
                .TransitionTo(ChargingPayment),
            When(StockUnavailable)
                .Publish(context => new OrderRejected(context.Saga.CorrelationId))
                .Finalize());

        During(ChargingPayment,
            When(PaymentCharged)
                .Send(context => new ShipOrder(context.Saga.CorrelationId))
                .TransitionTo(Shipping),
            When(PaymentFailed)
                .Publish(context => new OrderRejected(context.Saga.CorrelationId))
                .Finalize());

        During(Shipping,
            When(OrderShipped)
                .Publish(context => new OrderCompleted(context.Saga.CorrelationId))
                .Finalize());

        SetCompletedWhenFinalized();
    }

    public State ReservingStock { get; private set; } = null!;
    public State ChargingPayment { get; private set; } = null!;
    public State Shipping { get; private set; } = null!;

    public Event<OrderSubmitted> OrderSubmitted { get; private set; } = null!;
    public Event<StockReserved> StockReserved { get; private set; } = null!;
    public Event<StockUnavailable> StockUnavailable { get; private set; } = null!;
    public Event<PaymentCharged> PaymentCharged { get; private set; } = null!;
    public Event<PaymentFailed> PaymentFailed { get; private set; } = null!;
    public Event<OrderShipped> OrderShipped { get; private set; } = null!;
}
