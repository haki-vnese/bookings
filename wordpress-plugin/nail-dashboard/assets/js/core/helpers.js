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

function getResolvedTimeZone(timeZone) {
  const candidate = String(timeZone || '').trim();
  if (!candidate) return null;

  try {
    // Throws RangeError for unsupported/invalid timezone names.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return null;
  }
}

function formatPartsInTimeZone(date, timeZone) {
  const resolvedTimeZone = getResolvedTimeZone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolvedTimeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const out = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') out[part.type] = part.value;
  });

  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
  };
}

function parseDateTimeLocal(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function zonedLocalToUtcIso(localValue, timeZone) {
  const parts = parseDateTimeLocal(localValue);
  if (!parts) return null;

  const resolvedTimeZone = getResolvedTimeZone(timeZone);
  if (!resolvedTimeZone) {
    const localDate = new Date(localValue);
    return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
  }

  // Solve for UTC timestamp that formats back to the desired clock time in target timezone.
  let timestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);

  for (let i = 0; i < 4; i += 1) {
    const actual = formatPartsInTimeZone(new Date(timestamp), resolvedTimeZone);
    const desiredMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const actualMs = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    const diff = desiredMs - actualMs;
    if (diff === 0) break;
    timestamp += diff;
  }

  return new Date(timestamp).toISOString();
}

export function toDateTimeLocalValue(iso, timeZone) {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';

  const parts = formatPartsInTimeZone(date, timeZone);
  const pad = (value) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromDateTimeLocalToIso(value, timeZone) {
  return zonedLocalToUtcIso(value, timeZone);
}

export function toShortDateTime(value, timeZone) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return String(value || '-');

  const resolvedTimeZone = getResolvedTimeZone(timeZone);
  return date.toLocaleString(undefined, {
    timeZone: resolvedTimeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
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
