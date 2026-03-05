import express from 'express';
import { supabase } from '../db/supabase.js';

const router = express.Router();

router.post('/forminator', (req, res) => {
  const expected = process.env.FORMINATOR_WEBHOOK_TOKEN;
  if (expected && req.query.token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body;
  res.status(200).json({ ok: true });

  processForminatorPayload(payload).catch((err) => {
    console.error('Forminator webhook processing error:', err);
  });
});

async function processForminatorPayload(body) {
  const normalized = normalizePayload(body);

  const customerIdInput = getAny(normalized, ['customer_id', 'customerId']);
  const customerName = getAny(normalized, ['name_1', 'name', 'customer_name', 'customerName']);
  const customerEmailRaw = getAny(normalized, ['email_1', 'email', 'customer_email', 'customerEmail']);
  const notes = String(getAny(normalized, ['textarea_1', 'notes', 'note', 'message']) || '');

  const serviceCandidates = collectSelectionCandidates(normalized, [
    'service_id',
    'service',
    'service_name',
    'service_label',
    'select_1_label',
    'select_1_text',
    'select_1',
  ]);

  const technicianCandidates = collectSelectionCandidates(normalized, [
    'technician_id',
    'technician',
    'technician_name',
    'technician_label',
    'select_2_label',
    'select_2_text',
    'select_2',
  ]);

  const appointmentDate = getAny(normalized, ['date_1', 'appointment_date', 'date']);
  const timeHours = getAny(normalized, ['time_1_hours', 'hours']);
  const timeMinutes = getAny(normalized, ['time_1_minutes', 'minutes']);
  const flatTime = getAny(normalized, ['time_1', 'appointment_time', 'time']);

  const customerEmail = typeof customerEmailRaw === 'string' ? customerEmailRaw.trim().toLowerCase() : null;
  const customerNameClean = typeof customerName === 'string' ? customerName.trim() : '';

  if (serviceCandidates.length === 0 || technicianCandidates.length === 0 || !appointmentDate) {
    console.warn('Skipping webhook: missing required booking fields', {
      servicePresent: serviceCandidates.length > 0,
      technicianPresent: technicianCandidates.length > 0,
      appointmentDatePresent: Boolean(appointmentDate),
    });
    return;
  }

  if (!customerIdInput && !customerEmail) {
    console.warn('Skipping webhook: missing customer identifier (customer_id or email)');
    return;
  }

  const customerId = await resolveCustomer({
    customerId: customerIdInput,
    email: customerEmail,
    name: customerNameClean || customerEmail,
  });

  const service = await resolveService(serviceCandidates);
  const technicianId = await resolveTechnician(technicianCandidates);
  const startTime = toIsoStartTime(appointmentDate, timeHours, timeMinutes, flatTime);
  const durationMinutes = Number(service.duration_minutes || 60);
  const endTime = new Date(Date.parse(startTime) + durationMinutes * 60000).toISOString();

  const booking = {
    technician_id: technicianId,
    customer_id: customerId,
    service_id: service.id,
    start_time: startTime,
    end_time: endTime,
    notes,
  };

  const { error } = await supabase.from('bookings').insert([booking]);
  if (!error) return;

  if (isMissingColumnError(error, 'notes')) {
    const bookingWithNote = {
      technician_id: technicianId,
      customer_id: customerId,
      service_id: service.id,
      start_time: startTime,
      end_time: endTime,
      note: notes,
    };

    const { error: noteFallbackError } = await supabase.from('bookings').insert([bookingWithNote]);
    if (!noteFallbackError) return;

    if (!isMissingColumnError(noteFallbackError, 'note')) {
      throw noteFallbackError;
    }

    const bookingWithoutNotes = {
      technician_id: technicianId,
      customer_id: customerId,
      service_id: service.id,
      start_time: startTime,
      end_time: endTime,
    };

    const { error: plainFallbackError } = await supabase.from('bookings').insert([bookingWithoutNotes]);
    if (!plainFallbackError) return;
    throw plainFallbackError;
  }

  throw error;
}

function normalizePayload(input) {
  if (!input || typeof input !== 'object') return {};

  const out = { ...input };
  const candidates = [input.data, input.fields, input.payload, input.form_response, input.entry];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      Object.assign(out, candidate);
    }
  }

  if (Array.isArray(input.fields)) {
    for (const field of input.fields) {
      if (field && typeof field === 'object') {
        const key = field.name || field.key || field.field_name;
        const value = field.value;
        if (key && value !== undefined) out[key] = value;
      }
    }
  }

  return out;
}

function getAny(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

function collectSelectionCandidates(obj, keys) {
  const values = [];

  for (const key of keys) {
    pushSelectionValue(values, obj?.[key]);
  }

  return [...new Set(values.filter((value) => value && String(value).trim() !== ''))];
}

function pushSelectionValue(output, value) {
  if (value === null || value === undefined || value === '') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      pushSelectionValue(output, item);
    }
    return;
  }

  if (typeof value === 'object') {
    pushSelectionValue(output, value.id);
    pushSelectionValue(output, value.value);
    pushSelectionValue(output, value.label);
    pushSelectionValue(output, value.text);
    pushSelectionValue(output, value.name);
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return;

    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        pushSelectionValue(output, parsed);
        return;
      } catch {
        output.push(trimmed);
        return;
      }
    }

    output.push(trimmed);
    return;
  }

  output.push(String(value));
}

function parseMapEnv(envName) {
  const raw = process.env[envName];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    console.warn(`${envName} must be valid JSON`);
    return {};
  }
}

function withMappedValues(values, map) {
  const out = [];
  for (const value of values) {
    const key = String(value).trim();
    if (!key) continue;

    out.push(key);

    const normalized = key.toLowerCase();
    const underscored = normalized.replace(/\s+/g, '_');

    if (map[key]) out.push(String(map[key]).trim());
    if (map[normalized]) out.push(String(map[normalized]).trim());
    if (map[underscored]) out.push(String(map[underscored]).trim());
  }

  return [...new Set(out.filter(Boolean))];
}

async function resolveCustomer({ customerId, email, name }) {
  if (customerId && isUuid(customerId)) {
    const { data: existingById, error: byIdError } = await supabase
      .from('users')
      .select('id')
      .eq('id', customerId)
      .eq('role', 'customer')
      .maybeSingle();
    if (byIdError) throw byIdError;
    if (existingById?.id) return existingById.id;
  }

  if (!email) {
    throw new Error('Customer email is required when customer_id is not resolvable');
  }

  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .eq('role', 'customer')
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing?.id) return existing.id;

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert([{ name: name || email, email, role: 'customer' }])
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function resolveService(candidates) {
  const serviceMap = parseMapEnv('FORMINATOR_SERVICE_MAP');
  const valuesToTry = withMappedValues(candidates, serviceMap);

  for (const value of valuesToTry) {
    if (!isUuid(value)) continue;

    const { data, error } = await supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('id', value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, duration_minutes')
      .ilike('name', value)
      .limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0];
    if (data?.length > 1) {
      throw new Error(
        `Service selection is ambiguous for '${value}'. Set FORMINATOR_SERVICE_MAP, e.g. {"one":"<service-uuid>"}.`
      );
    }
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase
      .from('services')
      .select('id, name, duration_minutes')
      .ilike('name', `%${value}%`)
      .limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0];
  }

  throw new Error(
    `Service not found for selection: ${candidates[0]}. Set FORMINATOR_SERVICE_MAP, e.g. {"one":"<service-uuid>"}.`
  );
}

async function resolveTechnician(candidates) {
  const techMap = parseMapEnv('FORMINATOR_TECHNICIAN_MAP');
  const valuesToTry = withMappedValues(candidates, techMap);

  for (const value of valuesToTry) {
    if (!isUuid(value)) continue;

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('role', 'technician')
      .eq('id', value)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }

  for (const value of valuesToTry) {
    const query = supabase.from('users').select('id, name, email').eq('role', 'technician');
    const { data, error } = String(value).includes('@')
      ? await query.ilike('email', String(value)).limit(2)
      : await query.ilike('name', String(value)).limit(2);

    if (error) throw error;
    if (data?.length === 1) return data[0].id;
    if (data?.length > 1) {
      throw new Error(
        `Technician selection is ambiguous for '${value}'. Set FORMINATOR_TECHNICIAN_MAP, e.g. {"one":"<technician-uuid>"}.`
      );
    }
  }

  throw new Error(
    `Technician not found for selection: ${candidates[0]}. Set FORMINATOR_TECHNICIAN_MAP, e.g. {"one":"<technician-uuid>"}.`
  );
}

function toIsoStartTime(dateString, hours, minutes, flatTime) {
  const dateValue = String(dateString).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const parsed = resolveHourMinute(hours, minutes, flatTime);
    const [year, month, day] = dateValue.split('-').map(Number);
    return new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0).toISOString();
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
    const parsed = resolveHourMinute(hours, minutes, flatTime);
    const [month, day, year] = dateValue.split('/').map(Number);
    return new Date(year, month - 1, day, parsed.hours, parsed.minutes, 0).toISOString();
  }

  const fromDate = new Date(dateValue);
  if (Number.isNaN(fromDate.getTime())) {
    throw new Error(`Invalid date format: ${dateString}`);
  }
  return fromDate.toISOString();
}

function resolveHourMinute(hours, minutes, flatTime) {
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (Number.isFinite(parsedHours) && Number.isFinite(parsedMinutes)) {
    validateTimeParts(parsedHours, parsedMinutes);
    return { hours: parsedHours, minutes: parsedMinutes };
  }

  return parseFlatTime(flatTime);
}

function parseFlatTime(value) {
  const source = String(value || '').trim().toUpperCase();

  const ampmMatch = source.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampmMatch) {
    let parsedHours = Number(ampmMatch[1]);
    const parsedMinutes = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3];

    if (parsedHours === 12) {
      parsedHours = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      parsedHours += 12;
    }

    validateTimeParts(parsedHours, parsedMinutes);
    return { hours: parsedHours, minutes: parsedMinutes };
  }

  const match24h = source.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const parsedHours = Number(match24h[1]);
    const parsedMinutes = Number(match24h[2]);
    validateTimeParts(parsedHours, parsedMinutes);
    return { hours: parsedHours, minutes: parsedMinutes };
  }

  if (!source) {
    return { hours: 9, minutes: 0 };
  }

  throw new Error(`Invalid time format: ${value}`);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

function validateTimeParts(hours, minutes) {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error('Invalid time parts');
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid time format');
  }
}

function isMissingColumnError(error, columnName) {
  if (!error) return false;
  const message = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toUpperCase();
  return code === 'PGRST204' && message.includes(`'${String(columnName).toLowerCase()}' column`);
}

export default router;
