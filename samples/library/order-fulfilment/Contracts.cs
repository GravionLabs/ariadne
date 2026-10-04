namespace Acme.Orders;

// Every message carries the CorrelationId of the order, which is how MassTransit finds the saga.

// Events from the shop and from the services the saga talks to.
public record OrderSubmitted(Guid CorrelationId, string Sku, int Quantity);
public record StockReserved(Guid CorrelationId);
public record StockReservationFailed(Guid CorrelationId);
public record StockReleased(Guid CorrelationId);
public record PaymentCaptured(Guid CorrelationId);
public record PaymentDeclined(Guid CorrelationId, string Reason);
public record ShipmentDelivered(Guid CorrelationId);
public record ShipmentTimedOut(Guid CorrelationId);
public record ReturnWindowClosed(Guid CorrelationId);
public record CustomerNotified(Guid CorrelationId);
public record OrderCancelled(Guid CorrelationId, string Reason);
public record CancellationConfirmed(Guid CorrelationId);

// Commands the saga sends, each to the one service that handles it.
public record ReserveStock(Guid CorrelationId, string Sku, int Quantity);
public record CapturePayment(Guid CorrelationId);
public record ReleaseStock(Guid CorrelationId);
public record DispatchShipment(Guid CorrelationId);
public record ChaseCarrier(Guid CorrelationId);
public record NotifyCustomer(Guid CorrelationId);
public record CancelInWarehouse(Guid CorrelationId);

// Events the saga publishes, for anyone who is interested.
public record OrderRejected(Guid CorrelationId);
public record OrderCompleted(Guid CorrelationId);
public record OrderWasCancelled(Guid CorrelationId);
