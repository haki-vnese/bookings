export function canManage(role) {
  return role === 'admin' || role === 'superuser';
}

export function rolePill(role) {
  const value = String(role || '').toLowerCase();
  return `<span class="nd-role nd-role-${value}">${value || 'unknown'}</span>`;
}

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function asArray(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.data)) return input.data;
  return [];
}

export function toDateTimeLocalValue(iso) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDateTimeLocalToIso(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function toShortDateTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return String(value || '-');
  return date.toLocaleString();
}

export function buildEntityMaps(state) {
  return {
    usersById: new Map(state.data.users.map((user) => [user.id, user])),
    customersById: new Map(state.data.customers.map((customer) => [customer.id, customer])),
    servicesById: new Map(state.data.services.map((service) => [service.id, service])),
  };
}

export function getEntityLabel(id, map, fallback = 'Unknown') {
  const entity = map.get(id);
  if (!entity) return fallback;
  return entity.name || entity.email || fallback;
}

export function filterBookings(rows, filters) {
  const booking = filters.booking || {};

  return rows.filter((row) => {
    if (booking.technicianId && row.technician_id !== booking.technicianId) return false;
    if (booking.customerId && row.customer_id !== booking.customerId) return false;
    if (booking.serviceId && row.service_id !== booking.serviceId) return false;
    if (booking.date) {
      const start = String(row.start_time || '');
      if (!start.startsWith(booking.date)) return false;
    }
    return true;
  });
}
