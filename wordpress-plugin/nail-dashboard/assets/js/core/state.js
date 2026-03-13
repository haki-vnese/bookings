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
      staff: [],
      customers: [],
      bookings: [],
      services: [],
    },
    editing: {
      userId: null,
      staffId: null,
      customerId: null,
      bookingId: null,
    },
    modal: {
      type: null,
      rowId: null,
    },
    filters: {
      user: {
        q: '',
        role: '',
        salon: '',
      },
      staff: {
        q: '',
        salon: '',
      },
      customer: {
        q: '',
        salon: '',
      },
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
