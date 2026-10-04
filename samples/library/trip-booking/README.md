# Trip booking

Books a trip from a flight, a hotel and a car, one after the other, and cancels what was already booked when a later booking fails.

## The process

The traveller asks for a trip and the saga books the **flight**, then the **hotel**, then the **car**. Each booking is a command to the service that handles it, and its answer is an event that says whether it worked. When the car is booked, the trip is **confirmed**: the saga publishes `TripConfirmed`, asks for the itinerary to be issued and waits for it.

Any booking can fail, and then the earlier ones have to be undone, in the **reverse order** of how they were made. That is the compensation:

- If the **flight** fails, nothing has been booked yet: the trip is cancelled.
- If the **hotel** fails, the flight is cancelled (`CancellingFlight`).
- If the **car** fails, the hotel is cancelled first (`CancellingHotel`), then the flight.

Only when the last cancellation is confirmed does the saga publish `TripCancelled` and tell the traveller.

## What it shows

- A **compensation** written as ordinary states: each cancellation is a command, the wait for its confirmation is a state of its own, and the saga does not move on before the confirmation arrives.
- A path that gets longer the later the failure: three ways into the cancelled state.
- Two ways to end that both notify someone: confirmed and cancelled.

The messages are in [`Contracts.cs`](Contracts.cs), the saga in [`TripBookingStateMachine.cs`](TripBookingStateMachine.cs). The diagram is [`trip-booking.saga.yaml`](trip-booking.saga.yaml), the generated C# is in [`generated`](generated), and the documentation page is [`trip-booking.docs.md`](trip-booking.docs.md).
