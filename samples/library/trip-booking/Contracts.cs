namespace Acme.Travel;

// Every message carries the CorrelationId of the trip, which is how MassTransit finds the saga.

// Events from the airline, hotel and car-rental services, and from the traveller's app.
public record TripRequested(Guid CorrelationId, string Traveller, DateOnly From, DateOnly To);
public record FlightBooked(Guid CorrelationId);
public record FlightBookingFailed(Guid CorrelationId, string Reason);
public record HotelBooked(Guid CorrelationId);
public record HotelBookingFailed(Guid CorrelationId, string Reason);
public record CarBooked(Guid CorrelationId);
public record CarBookingFailed(Guid CorrelationId, string Reason);
public record HotelCancelled(Guid CorrelationId);
public record FlightCancelled(Guid CorrelationId);
public record ItineraryIssued(Guid CorrelationId);
public record TravellerNotified(Guid CorrelationId);

// Commands the saga sends.
public record BookFlight(Guid CorrelationId, string Traveller, DateOnly From, DateOnly To);
public record BookHotel(Guid CorrelationId);
public record BookCar(Guid CorrelationId);
public record CancelHotel(Guid CorrelationId);
public record CancelFlight(Guid CorrelationId);
public record IssueItinerary(Guid CorrelationId);
public record NotifyTraveller(Guid CorrelationId);

// Events the saga publishes.
public record TripConfirmed(Guid CorrelationId);
public record TripCancelled(Guid CorrelationId);
