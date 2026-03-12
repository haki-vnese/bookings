export function createInitialState(client) {
  return {
    loading: true,
    user: client.getUser(),
    active: 'overview',
    metrics: {
      bookings: 0,
      customers: 0,
      staff: 0,
      services: 0,
    },
    data: {
      users: [],
      customers: [],
      bookings: [],
      services: [],
    },
    editing: {
      userId: null,
      customerId: null,
      bookingId: null,
    },
    filters: {
      booking: {
        technicianId: '',
        customerId: '',
        serviceId: '',
        date: '',
        calendarWeekStart: '',
        viewMode: 'split',
      },
    },
    error: '',
  };
}
