const CALENDAR_START_HOUR = 7;
const CALENDAR_END_HOUR = 21;
const SLOT_MINUTES = 30;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toStartOfWeek(dateInput) {
  const date = new Date(dateInput || Date.now());
  if (Number.isNaN(date.getTime())) return new Date();
  date.setHours(0, 0, 0, 0);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function addDays(dateInput, amount) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + amount);
  return date;
}

function parseWeekAnchor(filters) {
  const explicit = String(filters?.booking?.calendarWeekStart || '');
  if (explicit) {
    const date = new Date(`${explicit}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return toStartOfWeek(date);
  }

  const fromDateFilter = String(filters?.booking?.date || '');
  if (fromDateFilter) {
    const date = new Date(`${fromDateFilter}T00:00:00`);
    if (!Number.isNaN(date.getTime())) return toStartOfWeek(date);
  }

  return toStartOfWeek(new Date());
}

function toHourLabel(hour, minute) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour}:${pad2(minute)} ${suffix}`;
}

function getWeekDays(weekAnchor) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekAnchor, index);
    return {
      date,
      key: toLocalDateKey(date),
      label: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      shortLabel: date.toLocaleDateString(undefined, { weekday: 'short' }),
    };
  });
}

function getTimeSlots() {
  const slotCount = ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60) / SLOT_MINUTES;
  return Array.from({ length: slotCount }, (_, index) => {
    const totalMinutes = CALENDAR_START_HOUR * 60 + index * SLOT_MINUTES;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return {
      hour,
      minute,
      key: `${hour}:${pad2(minute)}`,
    };
  });
}

function toSlotKey(dayKey, hour, minute) {
  return `${dayKey}|${hour}|${minute}`;
}

function mapRowsToSlots(rows, dayKeys) {
  const slotMap = new Map();
  let outsideRange = 0;

  rows.forEach((row) => {
    const start = new Date(row.start_time || '');
    if (Number.isNaN(start.getTime())) return;

    const dayKey = toLocalDateKey(start);
    if (!dayKeys.has(dayKey)) return;

    const hour = start.getHours();
    const minuteBucket = start.getMinutes() < 30 ? 0 : 30;
    const totalMinutes = hour * 60 + minuteBucket;

    if (totalMinutes < CALENDAR_START_HOUR * 60 || totalMinutes >= CALENDAR_END_HOUR * 60) {
      outsideRange += 1;
      return;
    }

    const slotKey = toSlotKey(dayKey, hour, minuteBucket);
    const list = slotMap.get(slotKey) || [];
    list.push(row);
    slotMap.set(slotKey, list);
  });

  return { slotMap, outsideRange };
}

function isRangeOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function findConflictingBookings(allRows, candidate, ignoreId) {
  const start = new Date(candidate.start_time || '');
  const end = new Date(candidate.end_time || '');

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  return allRows.filter((row) => {
    if (String(row.id) === String(ignoreId || '')) return false;
    if (String(row.technician_id || '') !== String(candidate.technician_id || '')) return false;

    const rowStart = new Date(row.start_time || '');
    const rowEnd = new Date(row.end_time || '');
    if (Number.isNaN(rowStart.getTime()) || Number.isNaN(rowEnd.getTime())) return false;

    return isRangeOverlap(start, end, rowStart, rowEnd);
  });
}

function buildConflictSet(rows) {
  const byTechnician = new Map();
  const conflictSet = new Set();

  rows.forEach((row) => {
    const key = String(row.technician_id || '');
    const list = byTechnician.get(key) || [];
    list.push(row);
    byTechnician.set(key, list);
  });

  byTechnician.forEach((list) => {
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      const aStart = new Date(a.start_time || '');
      const aEnd = new Date(a.end_time || '');
      if (Number.isNaN(aStart.getTime()) || Number.isNaN(aEnd.getTime())) continue;

      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        const bStart = new Date(b.start_time || '');
        const bEnd = new Date(b.end_time || '');
        if (Number.isNaN(bStart.getTime()) || Number.isNaN(bEnd.getTime())) continue;

        if (isRangeOverlap(aStart, aEnd, bStart, bEnd)) {
          conflictSet.add(String(a.id));
          conflictSet.add(String(b.id));
        }
      }
    }
  });

  return conflictSet;
}

function normalizeNote(value) {
  return String(value || '').trim().toLowerCase();
}

function getDurationMinutes(row) {
  const start = new Date(row.start_time || '');
  const end = new Date(row.end_time || '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.round(diff / 60000);
}

function buildBundleMeta(rows, maps, getEntityLabel) {
  const sorted = [...rows].sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime());
  const bundleByBookingId = new Map();

  let current = null;
  let bundleSeq = 1;

  for (const row of sorted) {
    const start = new Date(row.start_time || '');
    const end = new Date(row.end_time || '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    const key = [
      String(row.technician_id || ''),
      String(row.customer_id || ''),
      normalizeNote(row.note || row.notes),
      start.toISOString().slice(0, 10),
    ].join('|');

    const continuesCurrent =
      current &&
      current.key === key &&
      Math.abs(start.getTime() - current.lastEndMs) <= 5 * 60 * 1000;

    if (!continuesCurrent) {
      current = {
        key,
        id: `bundle-${bundleSeq}`,
        rows: [],
        lastEndMs: end.getTime(),
      };
      bundleSeq += 1;
    } else {
      current.lastEndMs = end.getTime();
    }

    current.rows.push(row);
  }

  // Build metadata for bundles only when they represent multiple split service lines.
  const bundles = new Map();
  sorted.forEach((row) => {
    const start = new Date(row.start_time || '');
    const end = new Date(row.end_time || '');
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

    const key = [
      String(row.technician_id || ''),
      String(row.customer_id || ''),
      normalizeNote(row.note || row.notes),
      start.toISOString().slice(0, 10),
    ].join('|');

    const existing = bundles.get(key) || [];
    existing.push(row);
    bundles.set(key, existing);
  });

  bundles.forEach((bundleRows) => {
    const ordered = bundleRows.sort((a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime());
    let chain = [ordered[0]];

    function flushChain() {
      if (chain.length <= 1) {
        chain = [];
        return;
      }

      const serviceNames = chain.map((item) => getEntityLabel(item.service_id, maps.servicesById, item.service_id));
      const totalMinutes = chain.reduce((sum, item) => sum + getDurationMinutes(item), 0);

      chain.forEach((item, index) => {
        bundleByBookingId.set(String(item.id), {
          index: index + 1,
          total: chain.length,
          serviceNames,
          totalMinutes,
        });
      });

      chain = [];
    }

    for (let i = 1; i < ordered.length; i += 1) {
      const prev = chain[chain.length - 1];
      const prevEnd = new Date(prev.end_time || '').getTime();
      const currentStart = new Date(ordered[i].start_time || '').getTime();

      if (Math.abs(currentStart - prevEnd) <= 5 * 60 * 1000) {
        chain.push(ordered[i]);
      } else {
        flushChain();
        chain = [ordered[i]];
      }
    }

    flushChain();
  });

  return bundleByBookingId;
}

function buildTooltip(row, maps, getEntityLabel, hasConflict, bundleMeta) {
  const customer = getEntityLabel(row.customer_id, maps.customersById, row.customer_id);
  const technician = getEntityLabel(row.technician_id, maps.usersById, row.technician_id);
  const service = getEntityLabel(row.service_id, maps.servicesById, row.service_id);

  const bundleLine = bundleMeta
    ? `Bundle: Service ${bundleMeta.index}/${bundleMeta.total} | Total ${bundleMeta.totalMinutes} min | ${bundleMeta.serviceNames.join(', ')}`
    : 'Bundle: Single service';

  return [
    `Customer: ${customer}`,
    `Technician: ${technician}`,
    `Service: ${service}`,
    bundleLine,
    `Start: ${new Date(row.start_time || '').toLocaleString()}`,
    `End: ${new Date(row.end_time || '').toLocaleString()}`,
    `Conflict: ${hasConflict ? 'Yes' : 'No'}`,
    `Note: ${row.note || row.notes || '-'}`,
    `Booking ID: ${row.id}`,
  ].join(' | ');
}

function getBookingById(rows, id) {
  return rows.find((row) => String(row.id) === String(id));
}

function buildReschedulePayload(booking, dropDate, dropHour, dropMinute) {
  const currentStart = new Date(booking.start_time || '');
  const currentEnd = new Date(booking.end_time || '');
  if (Number.isNaN(currentStart.getTime()) || Number.isNaN(currentEnd.getTime())) return null;

  const durationMs = Math.max(15 * 60 * 1000, currentEnd.getTime() - currentStart.getTime());

  const start = new Date(`${dropDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  start.setHours(dropHour, dropMinute, 0, 0);
  const end = new Date(start.getTime() + durationMs);

  return {
    technician_id: booking.technician_id,
    customer_id: booking.customer_id,
    service_id: booking.service_id,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    note: booking.note || booking.notes || '',
  };
}

function canProceedWithCollisionWarning(allRows, payload, bookingId, mode) {
  const conflicts = findConflictingBookings(allRows, payload, bookingId);
  if (!conflicts.length) return true;

  const conflictLabel = conflicts
    .slice(0, 3)
    .map((row) => new Date(row.start_time || '').toLocaleString())
    .join(', ');

  return window.confirm(
    `Collision warning: this ${mode} overlaps ${conflicts.length} booking(s) for the same technician.${
      conflictLabel ? `\nConflicts near: ${conflictLabel}` : ''
    }\nContinue anyway?`
  );
}

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
  const filteredRows = filterBookings(state.data.bookings, state.filters).sort(
    (a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()
  );

  const rows = filteredRows.slice(0, 30);
  const staffOptions = state.data.users.filter((user) => user.role === 'staff');
  const customerOptions = state.data.customers;
  const serviceOptions = state.data.services;

  const weekAnchor = parseWeekAnchor(state.filters);
  const weekStartKey = toLocalDateKey(weekAnchor);
  const weekDays = getWeekDays(weekAnchor);
  const weekRangeLabel = `${weekDays[0].date.toLocaleDateString()} - ${weekDays[6].date.toLocaleDateString()}`;
  const dayKeySet = new Set(weekDays.map((day) => day.key));
  const { slotMap, outsideRange } = mapRowsToSlots(filteredRows, dayKeySet);
  const slots = getTimeSlots();

  const conflictSet = buildConflictSet(filteredRows);
  const conflictCount = conflictSet.size;
  const bundleMetaByBookingId = buildBundleMeta(filteredRows, maps, getEntityLabel);

  const viewMode = String(state.filters.booking.viewMode || 'split');
  const showCalendar = viewMode !== 'table';
  const showTable = viewMode !== 'calendar';

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Bookings Calendar</h3>
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

      <div class="nd-view-toggle" role="group" aria-label="Bookings view mode">
        <button class="nd-secondary ${viewMode === 'calendar' ? 'is-active' : ''}" data-action="set-booking-view" data-view="calendar">Calendar only</button>
        <button class="nd-secondary ${viewMode === 'split' ? 'is-active' : ''}" data-action="set-booking-view" data-view="split">Calendar + Table</button>
        <button class="nd-secondary ${viewMode === 'table' ? 'is-active' : ''}" data-action="set-booking-view" data-view="table">Table only</button>
      </div>

      ${conflictCount ? `<p class="nd-warning">Collision warning: ${conflictCount} booking(s) overlap for the same technician in current filters.</p>` : ''}

      ${
        showCalendar
          ? `
      <div class="nd-calendar-head">
        <div>
          <h4 class="nd-calendar-title">Week View (30-minute slots)</h4>
          <p class="nd-muted">${esc(weekRangeLabel)}</p>
        </div>
        <div class="nd-calendar-nav">
          <button class="nd-secondary" data-action="calendar-week-prev">Previous Week</button>
          <button class="nd-secondary" data-action="calendar-week-today">This Week</button>
          <button class="nd-secondary" data-action="calendar-week-next">Next Week</button>
        </div>
      </div>

      <div class="nd-calendar-wrap">
        <div class="nd-calendar-grid" data-week-start="${esc(weekStartKey)}">
          <div class="nd-calendar-time-head">Time</div>
          ${weekDays
            .map(
              (day) =>
                `<div class="nd-calendar-day-head"><span>${esc(day.shortLabel)}</span><strong>${esc(day.label)}</strong></div>`
            )
            .join('')}

          ${slots
            .map((slot) => {
              const timeClass = slot.minute === 0 ? 'nd-calendar-time' : 'nd-calendar-time nd-calendar-time-half';
              const timeCol = `<div class="${timeClass}">${esc(toHourLabel(slot.hour, slot.minute))}</div>`;

              const dayCols = weekDays
                .map((day) => {
                  const slotRows = slotMap.get(toSlotKey(day.key, slot.hour, slot.minute)) || [];

                  const cards = slotRows
                    .map((row) => {
                      const hasConflict = conflictSet.has(String(row.id));
                      const bundleMeta = bundleMetaByBookingId.get(String(row.id));
                      const tooltip = buildTooltip(row, maps, getEntityLabel, hasConflict, bundleMeta);
                      const customer = getEntityLabel(row.customer_id, maps.customersById, row.customer_id);
                      const service = getEntityLabel(row.service_id, maps.servicesById, row.service_id);
                      const technician = getEntityLabel(row.technician_id, maps.usersById, row.technician_id);
                      const bundleBadge = bundleMeta
                        ? `<span class="nd-bundle-badge" title="${esc(bundleMeta.serviceNames.join(', '))}">Service ${bundleMeta.index}/${bundleMeta.total}</span>`
                        : '';

                      return `
                        <article
                          class="nd-calendar-card ${hasConflict ? 'nd-calendar-card-conflict' : ''}"
                          data-action="calendar-booking-card"
                          data-id="${esc(row.id)}"
                          draggable="${canMutate ? 'true' : 'false'}"
                          data-tooltip="${esc(tooltip)}"
                          title="${esc(tooltip)}"
                        >
                          <p class="nd-calendar-card-time">${esc(toShortDateTime(row.start_time))}</p>
                          <p class="nd-calendar-card-main">${esc(customer)}</p>
                          <p class="nd-calendar-card-sub">${esc(service)} | ${esc(technician)}</p>
                          ${bundleBadge}
                        </article>
                      `;
                    })
                    .join('');

                  return `
                    <div class="nd-calendar-slot" data-action="calendar-drop-slot" data-date="${esc(day.key)}" data-hour="${slot.hour}" data-minute="${slot.minute}">
                      ${cards || '<span class="nd-calendar-empty-slot"></span>'}
                    </div>
                  `;
                })
                .join('');

              return `${timeCol}${dayCols}`;
            })
            .join('')}
        </div>
      </div>
      `
          : ''
      }

      ${outsideRange ? `<p class="nd-muted">${outsideRange} booking(s) are outside displayed hours (${CALENDAR_START_HOUR}:00-${CALENDAR_END_HOUR}:00).</p>` : ''}
      ${canMutate ? '<p class="nd-muted">Drag a booking card to another day/time slot to reschedule. Booking creation remains disabled.</p>' : '<p class="nd-muted">Read-only calendar for this role.</p>'}

      ${
        showTable
          ? `
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
                      const hasConflict = conflictSet.has(String(row.id));
                      const bundleMeta = bundleMetaByBookingId.get(String(row.id));
                      const bundleLabel = bundleMeta
                        ? ` <span class="nd-bundle-inline">(Service ${bundleMeta.index}/${bundleMeta.total})</span>`
                        : '';
                      const baseRow = `
                        <tr class="${hasConflict ? 'nd-row-conflict' : ''}">
                          <td>${esc(toShortDateTime(row.start_time))}</td>
                          <td>${esc(toShortDateTime(row.end_time))}</td>
                          <td>${esc(getEntityLabel(row.customer_id, maps.customersById, row.customer_id))}</td>
                          <td>${esc(getEntityLabel(row.technician_id, maps.usersById, row.technician_id))}</td>
                          <td>${esc(getEntityLabel(row.service_id, maps.servicesById, row.service_id))}${bundleLabel}</td>
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
      `
          : ''
      }

      <p class="nd-muted">Showing ${rows.length} of ${filteredRows.length} filtered bookings (${state.data.bookings.length} total).</p>
    </section>
  `;
}

export function bindBookingsEvents(ctx) {
  const { app, state, client, refreshData, render, helpers } = ctx;
  const { fromDateTimeLocalToIso } = helpers;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  app.querySelectorAll('[data-action="set-booking-view"]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextMode = String(button.dataset.view || 'split');
      if (!['calendar', 'split', 'table'].includes(nextMode)) return;
      state.filters.booking.viewMode = nextMode;
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

      if (state.filters.booking.date) {
        const anchored = toStartOfWeek(new Date(`${state.filters.booking.date}T00:00:00`));
        state.filters.booking.calendarWeekStart = toLocalDateKey(anchored);
      }

      render();
    });
  });

  app.querySelectorAll('[data-action="reset-booking-filters"]').forEach((button) => {
    button.addEventListener('click', () => {
      const viewMode = state.filters.booking.viewMode || 'split';
      state.filters.booking = {
        technicianId: '',
        customerId: '',
        serviceId: '',
        date: '',
        calendarWeekStart: '',
        viewMode,
      };
      render();
    });
  });

  app.querySelectorAll('[data-action="calendar-week-prev"]').forEach((button) => {
    button.addEventListener('click', () => {
      const anchor = parseWeekAnchor(state.filters);
      state.filters.booking.calendarWeekStart = toLocalDateKey(addDays(anchor, -7));
      render();
    });
  });

  app.querySelectorAll('[data-action="calendar-week-next"]').forEach((button) => {
    button.addEventListener('click', () => {
      const anchor = parseWeekAnchor(state.filters);
      state.filters.booking.calendarWeekStart = toLocalDateKey(addDays(anchor, 7));
      render();
    });
  });

  app.querySelectorAll('[data-action="calendar-week-today"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.booking.calendarWeekStart = toLocalDateKey(toStartOfWeek(new Date()));
      render();
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

      if (!canProceedWithCollisionWarning(state.data.bookings, payload, id, 'edit')) return;

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

  const canDrag = helpers.canManage(String(state.user?.role || '').toLowerCase());
  if (!canDrag) return;

  app.querySelectorAll('[data-action="calendar-booking-card"]').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const id = card.dataset.id;
      if (!id) return;
      card.classList.add('is-dragging');
      event.dataTransfer?.setData('text/booking-id', id);
      event.dataTransfer?.setData('text/plain', id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      app.querySelectorAll('.nd-calendar-slot.is-drop-target').forEach((el) => {
        el.classList.remove('is-drop-target');
      });
    });
  });

  app.querySelectorAll('[data-action="calendar-drop-slot"]').forEach((slot) => {
    slot.addEventListener('dragover', (event) => {
      event.preventDefault();
      slot.classList.add('is-drop-target');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    slot.addEventListener('dragleave', () => {
      slot.classList.remove('is-drop-target');
    });

    slot.addEventListener('drop', async (event) => {
      event.preventDefault();
      slot.classList.remove('is-drop-target');

      const id = event.dataTransfer?.getData('text/booking-id') || event.dataTransfer?.getData('text/plain');
      const dropDate = String(slot.dataset.date || '');
      const dropHour = Number(slot.dataset.hour);
      const dropMinute = Number(slot.dataset.minute || 0);
      if (!id || !dropDate || Number.isNaN(dropHour) || Number.isNaN(dropMinute)) return;

      const booking = getBookingById(state.data.bookings, id);
      if (!booking) return;

      const payload = buildReschedulePayload(booking, dropDate, dropHour, dropMinute);
      if (!payload) {
        window.alert('Unable to move this booking because date/time is invalid.');
        return;
      }

      if (!canProceedWithCollisionWarning(state.data.bookings, payload, id, 'move')) return;

      try {
        await client.updateBooking(id, payload);
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to reschedule booking');
      }
    });
  });
}
