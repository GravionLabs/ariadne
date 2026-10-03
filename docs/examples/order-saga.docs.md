# order

## Diagram

```mermaid
stateDiagram-v2
  direction TB
  state "Reserving stock" as Reserving_stock
  state "Charging payment" as Charging_payment
  [*] --> Reserving_stock : OrderReceived (from Shop API) / Send ReserveStock
  Reserving_stock --> Charging_payment : StockReserved (from Warehouse service) / Send ChargePayment
  Reserving_stock --> Cancelled : StockUnavailable (from Warehouse service)
  Charging_payment --> Shipping : PaymentCharged (from Payment service) / Send ShipOrder, Publish OrderAccepted
  Charging_payment --> Cancelled : PaymentFailed (from Payment service)
  Shipping --> Completed : OrderShipped (from Warehouse service)
  Completed --> [*]
  Cancelled --> [*]
  classDef compensation fill:#fef3c7,stroke:#f59e0b,color:#92400e
  class Reserving_stock,Charging_payment compensation
```

## States

| State            | Type     | Description                                                      | Activities                              | Compensation  | Retry      | Timeout |
| ---------------- | -------- | ---------------------------------------------------------------- | --------------------------------------- | ------------- | ---------- | ------- |
| Initial          | Initial  |                                                                  |                                         |               |            |         |
| Reserving stock  | Decision | Waits for the warehouse to confirm that the items are available. | Send ReserveStock                       | ReleaseStock  |            |         |
| Charging payment | Decision | Waits for the payment service.                                   | Send ChargePayment                      | RefundPayment | 3 attempts | 30s     |
| Shipping         | State    |                                                                  | Send ShipOrder<br>Publish OrderAccepted |               |            |         |
| Completed        | Final    |                                                                  |                                         |               |            |         |
| Cancelled        | Final    |                                                                  |                                         |               |            |         |

## Transitions

| From             | Event            | Source            | To               | Kind    |
| ---------------- | ---------------- | ----------------- | ---------------- | ------- |
| Initial          | OrderReceived    | Shop API          | Reserving stock  | Forward |
| Reserving stock  | StockReserved    | Warehouse service | Charging payment | Forward |
| Reserving stock  | StockUnavailable | Warehouse service | Cancelled        | Forward |
| Charging payment | PaymentCharged   | Payment service   | Shipping         | Forward |
| Charging payment | PaymentFailed    | Payment service   | Cancelled        | Forward |
| Shipping         | OrderShipped     | Warehouse service | Completed        | Forward |

## Commands

| Command       | Sent in          |
| ------------- | ---------------- |
| ChargePayment | Charging payment |
| ReserveStock  | Reserving stock  |
| ShipOrder     | Shipping         |

## Events

| Event            | Origin   | Published in | Triggers                           |
| ---------------- | -------- | ------------ | ---------------------------------- |
| OrderAccepted    | Internal | Shipping     |                                    |
| OrderReceived    | External |              | Initial → Reserving stock          |
| OrderShipped     | External |              | Shipping → Completed               |
| PaymentCharged   | External |              | Charging payment → Shipping        |
| PaymentFailed    | External |              | Charging payment → Cancelled       |
| StockReserved    | External |              | Reserving stock → Charging payment |
| StockUnavailable | External |              | Reserving stock → Cancelled        |
