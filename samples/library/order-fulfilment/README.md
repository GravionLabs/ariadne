# Order fulfilment

Takes an order from the shop to the customer's door: reserve the stock, take the payment, ship it, and keep the order open until the return window has closed.

## The process

A customer submits an order and the saga asks the warehouse to **reserve the stock**. If the stock is there, it asks the payment service to **capture the payment**; if not, the order is rejected. A captured payment sets the **shipment** off, and the order waits for the carrier to say it was delivered.

Things go wrong, and each has its own way through the saga:

- **Payment is declined.** The stock already reserved must go back, so the saga sends `ReleaseStock` and waits in `ReleasingStock` until the warehouse confirms. Only then is the customer told that the order was rejected. This is the compensation of the saga: an earlier step is undone because a later one failed.
- **The carrier is late.** The scheduler sends `ShipmentTimedOut` when the delivery has not been reported in time; the saga chases the carrier and moves to `Delayed`, which still ends in a delivery.
- **The shop cancels.** `OrderCancelled` is handled in any state (`DuringAny`): the warehouse is told, and the saga waits for its confirmation before it ends.
- **A delivered order stays open.** `Delivered` publishes `OrderCompleted` and waits for `ReturnWindowClosed`, so a return can still be tied to the order.

## What it shows

- `Initially`, `During` and `DuringAny` (the Any state in the diagram), and `WhenEnter` for what a state does when it is entered.
- Commands (`Send`) to the services that handle them, and events (`Publish`) for everyone else.
- A compensation, and timeouts that arrive as events from the scheduler.
- That every path ends in the final state, and nothing is done on the way into it.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`OrderFulfilmentStateMachine.cs`](OrderFulfilmentStateMachine.cs). The diagram is [`order-fulfilment.saga.yaml`](order-fulfilment.saga.yaml), the C# Ariadne generates from it is in [`generated`](generated), and the documentation page is [`order-fulfilment.docs.md`](order-fulfilment.docs.md).
