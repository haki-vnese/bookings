export function renderBookingsPanel(state, helpers) {
  const {
    canManage,
    esc,
    toDateTimeLocalValue,
    toShortDateTime,
    buildEntityMaps,
    getEntityLabel,
    filterBookings,
  } = helpers;

  const role = String(state.user?.role || '').toLowerCase();
  const canMutate = canManage(role);
  const maps = buildEntityMaps(state);
  const filteredRows = filterBookings(state.data.bookings, state.filters);
  const rows = filteredRows.slice(0, 30);
  const staffOptions = state.data.users.filter((user) => user.role === 'staff');
  const customerOptions = state.data.customers;
  const serviceOptions = state.data.services;
  const slotOptions = state.bookingSlots.options;

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Recent Bookings</h3>
        <button class="nd-ghost" data-action="refresh-data">Refresh</button>
      </div>
      <div class="nd-filters">
        <select id="nd-filter-booking-technician" data-action="filter-bookings">
          <option value="">All Technicians</option>
          ${staffOptions
            .map(
              (staff) =>
                `<option value="${esc(staff.id)}" ${state.filters.booking.technicianId === staff.id ? 'selected' : ''}>${esc(staff.name)}</option>`
            )
            .join('')}
        </select>
        <select id="nd-filter-booking-customer" data-action="filter-bookings">
          <option value="">All Customers</option>
          ${customerOptions
            .map(
              (customer) =>
                `<option value="${esc(customer.id)}" ${state.filters.booking.customerId === customer.id ? 'selected' : ''}>${esc(customer.name)}</option>`
            )
            .join('')}
        </select>
        <select id="nd-filter-booking-service" data-action="filter-bookings">
          <option value="">All Services</option>
          ${serviceOptions
            .map(
              (service) =>
                `<option value="${esc(service.id)}" ${state.filters.booking.serviceId === service.id ? 'selected' : ''}>${esc(service.name)}</option>`
            )
            .join('')}
        </select>
        <input id="nd-filter-booking-date" data-action="filter-bookings" type="date" value="${esc(state.filters.booking.date)}" />
        <button class="nd-secondary" data-action="reset-booking-filters">Reset Filters</button>
      </div>
      ${
        canMutate
          ? `
            <form id="nd-booking-form" class="nd-inline-form nd-inline-form-booking">
              <select name="technician_id" id="nd-booking-technician" required>
                <option value="">Technician</option>
                ${staffOptions
                  .map(
                    (staff) =>
                      `<option value="${esc(staff.id)}" ${state.bookingSlots.technicianId === staff.id ? 'selected' : ''}>${esc(staff.name)} (${esc(staff.email)})</option>`
                  )
                  .join('')}
              </select>
              <select name="customer_id" required>
                <option value="">Customer</option>
                ${customerOptions
                  .map((customer) => `<option value="${esc(customer.id)}">${esc(customer.name)} (${esc(customer.email)})</option>`)
                  .join('')}
              </select>
              <select name="service_id" id="nd-booking-service" required>
                <option value="">Service</option>
                ${serviceOptions
                  .map(
                    (service) =>
                      `<option value="${esc(service.id)}" ${state.bookingSlots.serviceId === service.id ? 'selected' : ''}>${esc(service.name)} (${esc(service.duration_minutes || '-')}m)</option>`
                  )
                  .join('')}
              </select>
              <input name="date" id="nd-booking-date" type="date" required value="${esc(state.bookingSlots.date)}" />
              <div class="nd-slot-row">
                <button type="button" class="nd-secondary" data-action="load-booking-slots">Load Slots</button>
                <select name="slot" id="nd-booking-slot" required ${slotOptions.length ? '' : 'disabled'}>
                  <option value="">${
                    state.bookingSlots.loading
                      ? 'Loading...'
                      : slotOptions.length
                        ? 'Select Slot'
                        : 'No Slots Loaded'
                  }</option>
                  ${slotOptions.map((slot) => `<option value="${slot.start}|${slot.end}">${slot.start} - ${slot.end}</option>`).join('')}
                </select>
              </div>
              <input name="note" placeholder="Note (optional)" />
              <button type="submit">Create Booking</button>
            </form>
            ${state.bookingSlots.error ? `<p class="nd-error">${esc(state.bookingSlots.error)}</p>` : ''}
            <p id="nd-booking-error" class="nd-error"></p>
          `
          : '<p class="nd-muted">Read-only booking list for this role.</p>'
      }
      <div class="nd-table-wrap">
        <table class="nd-table">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Customer</th>
              <th>Technician</th>
              <th>Service</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map((row) => {
                      const isEditing = state.editing.bookingId === row.id;
                      const baseRow = `
                        <tr>
                          <td>${esc(toShortDateTime(row.start_time))}</td>
                          <td>${esc(toShortDateTime(row.end_time))}</td>
                          <td>${esc(getEntityLabel(row.customer_id, maps.customersById, row.customer_id))}</td>
                          <td>${esc(getEntityLabel(row.technician_id, maps.usersById, row.technician_id))}</td>
                          <td>${esc(getEntityLabel(row.service_id, maps.servicesById, row.service_id))}</td>
                          <td>
                            ${
                              canMutate
                                ? `<div class="nd-row-actions"><button class="nd-secondary" data-action="start-edit-booking" data-id="${esc(row.id)}">Edit</button><button class="nd-danger" data-action="delete-booking" data-id="${esc(row.id)}">Delete</button></div>`
                                : '-'
                            }
                          </td>
                        </tr>
                      `;

                      if (!isEditing) return baseRow;

                      return `${baseRow}
                        <tr class="nd-edit-row">
                          <td colspan="6">
                            <form class="nd-inline-form nd-inline-form-booking-edit" id="nd-booking-edit-form-${esc(row.id)}" data-id="${esc(row.id)}">
                              <select name="technician_id" required>
                                ${staffOptions
                                  .map(
                                    (staff) =>
                                      `<option value="${esc(staff.id)}" ${staff.id === row.technician_id ? 'selected' : ''}>${esc(staff.name)}</option>`
                                  )
                                  .join('')}
                              </select>
                              <select name="customer_id" required>
                                ${customerOptions
                                  .map(
                                    (customer) =>
                                      `<option value="${esc(customer.id)}" ${customer.id === row.customer_id ? 'selected' : ''}>${esc(customer.name)}</option>`
                                  )
                                  .join('')}
                              </select>
                              <select name="service_id" required>
                                ${serviceOptions
                                  .map(
                                    (service) =>
                                      `<option value="${esc(service.id)}" ${service.id === row.service_id ? 'selected' : ''}>${esc(service.name)}</option>`
                                  )
                                  .join('')}
                              </select>
                              <input name="start_time" type="datetime-local" required value="${esc(toDateTimeLocalValue(row.start_time))}" />
                              <input name="end_time" type="datetime-local" required value="${esc(toDateTimeLocalValue(row.end_time))}" />
                              <input name="note" placeholder="Note" value="${esc(row.note || row.notes || '')}" />
                              <button type="submit">Save</button>
                              <button type="button" class="nd-secondary" data-action="cancel-edit-booking">Cancel</button>
                            </form>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="6" class="nd-empty">No bookings match filters.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      <p class="nd-muted">Showing ${rows.length} of ${filteredRows.length} filtered bookings (${state.data.bookings.length} total).</p>
    </section>
  `;
}

export async function loadBookingSlots(ctx) {
  const { state, client } = ctx;
  const technicianId = state.bookingSlots.technicianId;
  const serviceId = state.bookingSlots.serviceId;
  const date = state.bookingSlots.date;

  if (!technicianId || !serviceId || !date) {
    state.bookingSlots.error = 'Select technician, service, and date first.';
    return;
  }

  state.bookingSlots.loading = true;
  state.bookingSlots.error = '';

  try {
    const result = await client.getAvailability(technicianId, date, serviceId);
    state.bookingSlots.options = Array.isArray(result?.availableSlots) ? result.availableSlots : [];
  } catch (error) {
    state.bookingSlots.options = [];
    state.bookingSlots.error = error.message || 'Failed to load availability';
  } finally {
    state.bookingSlots.loading = false;
  }
}

export function bindBookingsEvents(ctx) {
  const { app, state, client, refreshData, render, helpers, resetBookingSlots } = ctx;
  const { fromDateTimeLocalToIso } = helpers;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  app.querySelectorAll('[data-action="filter-bookings"]').forEach((input) => {
    input.addEventListener('change', () => {
      state.filters.booking.technicianId = String(
        document.getElementById('nd-filter-booking-technician')?.value || ''
      );
      state.filters.booking.customerId = String(
        document.getElementById('nd-filter-booking-customer')?.value || ''
      );
      state.filters.booking.serviceId = String(
        document.getElementById('nd-filter-booking-service')?.value || ''
      );
      state.filters.booking.date = String(document.getElementById('nd-filter-booking-date')?.value || '');
      render();
    });
  });

  app.querySelectorAll('[data-action="reset-booking-filters"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.booking = {
        technicianId: '',
        customerId: '',
        serviceId: '',
        date: '',
      };
      render();
    });
  });

  const bookingForm = document.getElementById('nd-booking-form');
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorNode = document.getElementById('nd-booking-error');
      errorNode.textContent = '';

      const formData = new FormData(bookingForm);
      const date = String(formData.get('date') || '').trim();
      const slotRaw = String(formData.get('slot') || '').trim();
      const [slotStart, slotEnd] = slotRaw.split('|');

      if (!date || !slotStart || !slotEnd) {
        errorNode.textContent = 'Please choose date and slot.';
        return;
      }

      const payload = {
        technician_id: String(formData.get('technician_id') || '').trim(),
        customer_id: String(formData.get('customer_id') || '').trim(),
        service_id: String(formData.get('service_id') || '').trim(),
        start_time: `${date}T${slotStart}:00Z`,
        end_time: `${date}T${slotEnd}:00Z`,
        note: String(formData.get('note') || '').trim(),
      };

      try {
        await client.createBooking(payload);
        bookingForm.reset();
        resetBookingSlots(state);
        await refreshData();
        render();
      } catch (error) {
        errorNode.textContent = error.message || 'Failed to create booking';
      }
    });
  }

  const slotLoader = app.querySelector('[data-action="load-booking-slots"]');
  if (slotLoader) {
    slotLoader.addEventListener('click', async () => {
      await loadBookingSlots(ctx);
      render();
    });
  }

  const bookingDate = document.getElementById('nd-booking-date');
  const bookingTech = document.getElementById('nd-booking-technician');
  const bookingService = document.getElementById('nd-booking-service');

  [bookingDate, bookingTech, bookingService].forEach((input) => {
    if (!input) return;
    input.addEventListener('change', () => {
      state.bookingSlots.options = [];
      state.bookingSlots.error = '';
      state.bookingSlots.date = bookingDate?.value || '';
      state.bookingSlots.technicianId = bookingTech?.value || '';
      state.bookingSlots.serviceId = bookingService?.value || '';
    });
  });

  app.querySelectorAll('[data-action="start-edit-booking"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.bookingId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="cancel-edit-booking"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.bookingId = null;
      render();
    });
  });

  app.querySelectorAll('form[id^="nd-booking-edit-form-"]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = form.dataset.id;
      if (!id) return;

      const formData = new FormData(form);
      const startIso = fromDateTimeLocalToIso(String(formData.get('start_time') || ''));
      const endIso = fromDateTimeLocalToIso(String(formData.get('end_time') || ''));

      if (!startIso || !endIso) {
        window.alert('Invalid booking date/time.');
        return;
      }

      const payload = {
        technician_id: String(formData.get('technician_id') || '').trim(),
        customer_id: String(formData.get('customer_id') || '').trim(),
        service_id: String(formData.get('service_id') || '').trim(),
        start_time: startIso,
        end_time: endIso,
        note: String(formData.get('note') || '').trim(),
      };

      try {
        await client.updateBooking(id, payload);
        state.editing.bookingId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to update booking');
      }
    });
  });

  app.querySelectorAll('[data-action="delete-booking"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      if (!window.confirm('Delete this booking?')) return;

      try {
        await client.deleteBooking(id);
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to delete booking');
      }
    });
  });
}
