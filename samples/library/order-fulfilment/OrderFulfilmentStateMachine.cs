using MassTransit;

namespace Acme.Orders;

/// <summary>
/// Takes an order from the shop to the customer's door: stock, payment, shipping. When payment is
/// declined the reserved stock is given back before the customer is told. A delivered order stays
/// open until its return window has closed.
/// </summary>
public class OrderFulfilmentStateMachine : MassTransitStateMachine<OrderFulfilmentState>
{
    public OrderFulfilmentStateMachine()
    {
        InstanceState(
            x => x.CurrentState,
            ReservingStock, AwaitingPayment, ReleasingStock, Rejected, Shipping, Delayed, Delivered, Cancelling);

        Event(() => OrderSubmitted);
        Event(() => StockReserved);
        Event(() => StockReservationFailed);
        Event(() => StockReleased);
        Event(() => PaymentCaptured);
        Event(() => PaymentDeclined);
        Event(() => ShipmentDelivered);
        Event(() => ShipmentTimedOut);
        Event(() => ReturnWindowClosed);
        Event(() => CustomerNotified);
        Event(() => OrderCancelled);
        Event(() => CancellationConfirmed);

        Initially(
            When(OrderSubmitted)
                .Send(context => new ReserveStock(context.Saga.CorrelationId, context.Message.Sku, context.Message.Quantity))
                .TransitionTo(ReservingStock));

        During(ReservingStock,
            When(StockReserved)
                .Send(context => new CapturePayment(context.Saga.CorrelationId))
                .TransitionTo(AwaitingPayment),
            When(StockReservationFailed)
                .TransitionTo(Rejected));

        During(AwaitingPayment,
            When(PaymentCaptured)
                .Send(context => new DispatchShipment(context.Saga.CorrelationId))
                .TransitionTo(Shipping),
            // Compensation: the stock reserved for this order goes back before the order ends.
            When(PaymentDeclined)
                .Send(context => new ReleaseStock(context.Saga.CorrelationId))
                .TransitionTo(ReleasingStock));

        During(ReleasingStock,
            When(StockReleased)
                .TransitionTo(Rejected));

        During(Rejected,
            When(CustomerNotified)
                .Finalize());

        During(Shipping,
            When(ShipmentDelivered)
                .TransitionTo(Delivered),
            // The scheduler sends this when the carrier has not delivered in time.
            When(ShipmentTimedOut)
                .Send(context => new ChaseCarrier(context.Saga.CorrelationId))
                .TransitionTo(Delayed));

        During(Delayed,
            When(ShipmentDelivered)
                .TransitionTo(Delivered));

        // The order stays open while the customer may still send the goods back.
        During(Delivered,
            When(ReturnWindowClosed)
                .Finalize());

        During(Cancelling,
            When(CancellationConfirmed)
                .Finalize());

        // The shop can cancel an order at any time.
        DuringAny(
            When(OrderCancelled)
                .Send(context => new CancelInWarehouse(context.Saga.CorrelationId))
                .TransitionTo(Cancelling));

        WhenEnter(Rejected, binder => binder
            .Publish(context => new OrderRejected(context.Saga.CorrelationId))
            .Send(context => new NotifyCustomer(context.Saga.CorrelationId)));

        WhenEnter(Delivered, binder => binder
            .Publish(context => new OrderCompleted(context.Saga.CorrelationId)));

        WhenEnter(Cancelling, binder => binder
            .Publish(context => new OrderWasCancelled(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State ReservingStock { get; private set; } = null!;
    public State AwaitingPayment { get; private set; } = null!;
    public State ReleasingStock { get; private set; } = null!;
    public State Rejected { get; private set; } = null!;
    public State Shipping { get; private set; } = null!;
    public State Delayed { get; private set; } = null!;
    public State Delivered { get; private set; } = null!;
    public State Cancelling { get; private set; } = null!;

    public Event<OrderSubmitted> OrderSubmitted { get; private set; } = null!;
    public Event<StockReserved> StockReserved { get; private set; } = null!;
    public Event<StockReservationFailed> StockReservationFailed { get; private set; } = null!;
    public Event<StockReleased> StockReleased { get; private set; } = null!;
    public Event<PaymentCaptured> PaymentCaptured { get; private set; } = null!;
    public Event<PaymentDeclined> PaymentDeclined { get; private set; } = null!;
    public Event<ShipmentDelivered> ShipmentDelivered { get; private set; } = null!;
    public Event<ShipmentTimedOut> ShipmentTimedOut { get; private set; } = null!;
    public Event<ReturnWindowClosed> ReturnWindowClosed { get; private set; } = null!;
    public Event<CustomerNotified> CustomerNotified { get; private set; } = null!;
    public Event<OrderCancelled> OrderCancelled { get; private set; } = null!;
    public Event<CancellationConfirmed> CancellationConfirmed { get; private set; } = null!;
}
