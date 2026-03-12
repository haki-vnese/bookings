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
    bookingSlots: {
      options: [],
      technicianId: '',
      serviceId: '',
      date: '',
      loading: false,
      error: '',
    },
    filters: {
      booking: {
        technicianId: '',
        customerId: '',
        serviceId: '',
        date: '',
      },
    },
    error: '',
  };
}

export function resetBookingSlots(state) {
  state.bookingSlots = {
    options: [],
    technicianId: '',
    serviceId: '',
    date: '',
    loading: false,
    error: '',
  };
}
