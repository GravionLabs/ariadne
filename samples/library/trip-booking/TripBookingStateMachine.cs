using MassTransit;

namespace Acme.Travel;

/// <summary>
/// Books a trip from a flight, a hotel and a car, one after the other. When a later booking fails,
/// the ones already made are cancelled in reverse order (the compensation) before the traveller is
/// told that the trip is off.
/// </summary>
public class TripBookingStateMachine : MassTransitStateMachine<TripBookingState>
{
    public TripBookingStateMachine()
    {
        InstanceState(
            x => x.CurrentState,
            BookingFlight, BookingHotel, BookingCar, Confirmed, CancellingHotel, CancellingFlight, Cancelled);

        Event(() => TripRequested);
        Event(() => FlightBooked);
        Event(() => FlightBookingFailed);
        Event(() => HotelBooked);
        Event(() => HotelBookingFailed);
        Event(() => CarBooked);
        Event(() => CarBookingFailed);
        Event(() => HotelCancelled);
        Event(() => FlightCancelled);
        Event(() => ItineraryIssued);
        Event(() => TravellerNotified);

        Initially(
            When(TripRequested)
                .Send(context => new BookFlight(context.Saga.CorrelationId, context.Message.Traveller, context.Message.From, context.Message.To))
                .TransitionTo(BookingFlight));

        During(BookingFlight,
            When(FlightBooked)
                .Send(context => new BookHotel(context.Saga.CorrelationId))
                .TransitionTo(BookingHotel),
            // Nothing has been booked yet, so there is nothing to undo.
            When(FlightBookingFailed)
                .TransitionTo(Cancelled));

        During(BookingHotel,
            When(HotelBooked)
                .Send(context => new BookCar(context.Saga.CorrelationId))
                .TransitionTo(BookingCar),
            // Undo: the flight is cancelled.
            When(HotelBookingFailed)
                .Send(context => new CancelFlight(context.Saga.CorrelationId))
                .TransitionTo(CancellingFlight));

        During(BookingCar,
            When(CarBooked)
                .TransitionTo(Confirmed),
            // Undo, in reverse order: the hotel first, then the flight.
            When(CarBookingFailed)
                .Send(context => new CancelHotel(context.Saga.CorrelationId))
                .TransitionTo(CancellingHotel));

        During(CancellingHotel,
            When(HotelCancelled)
                .Send(context => new CancelFlight(context.Saga.CorrelationId))
                .TransitionTo(CancellingFlight));

        During(CancellingFlight,
            When(FlightCancelled)
                .TransitionTo(Cancelled));

        During(Confirmed,
            When(ItineraryIssued)
                .Finalize());

        During(Cancelled,
            When(TravellerNotified)
                .Finalize());

        WhenEnter(Confirmed, binder => binder
            .Publish(context => new TripConfirmed(context.Saga.CorrelationId))
            .Send(context => new IssueItinerary(context.Saga.CorrelationId)));

        WhenEnter(Cancelled, binder => binder
            .Publish(context => new TripCancelled(context.Saga.CorrelationId))
            .Send(context => new NotifyTraveller(context.Saga.CorrelationId)));

        SetCompletedWhenFinalized();
    }

    public State BookingFlight { get; private set; } = null!;
    public State BookingHotel { get; private set; } = null!;
    public State BookingCar { get; private set; } = null!;
    public State Confirmed { get; private set; } = null!;
    public State CancellingHotel { get; private set; } = null!;
    public State CancellingFlight { get; private set; } = null!;
    public State Cancelled { get; private set; } = null!;

    public Event<TripRequested> TripRequested { get; private set; } = null!;
    public Event<FlightBooked> FlightBooked { get; private set; } = null!;
    public Event<FlightBookingFailed> FlightBookingFailed { get; private set; } = null!;
    public Event<HotelBooked> HotelBooked { get; private set; } = null!;
    public Event<HotelBookingFailed> HotelBookingFailed { get; private set; } = null!;
    public Event<CarBooked> CarBooked { get; private set; } = null!;
    public Event<CarBookingFailed> CarBookingFailed { get; private set; } = null!;
    public Event<HotelCancelled> HotelCancelled { get; private set; } = null!;
    public Event<FlightCancelled> FlightCancelled { get; private set; } = null!;
    public Event<ItineraryIssued> ItineraryIssued { get; private set; } = null!;
    public Event<TravellerNotified> TravellerNotified { get; private set; } = null!;
}
