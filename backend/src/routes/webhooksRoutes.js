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
  const note = String(getAny(normalized, ['textarea_1', 'note', 'notes', 'message']) || '');

  const serviceSelection = firstSelection(
    getAny(normalized, ['select_1', 'service_id', 'service', 'service_name'])
  );
  const technicianSelection = firstSelection(
    getAny(normalized, ['select_2', 'technician_id', 'technician', 'technician_name'])
  );

  const appointmentDate = getAny(normalized, ['date_1', 'appointment_date', 'date']);
  const timeHours = getAny(normalized, ['time_1_hours', 'hours']);
  const timeMinutes = getAny(normalized, ['time_1_minutes', 'minutes']);
  const flatTime = getAny(normalized, ['time_1', 'appointment_time', 'time']);

  const customerEmail = typeof customerEmailRaw === 'string'
    ? customerEmailRaw.trim().toLowerCase()
    : null;
  const customerNameClean = typeof customerName === 'string' ? customerName.trim() : '';

  if (!serviceSelection || !technicianSelection || !appointmentDate) {
    console.warn('Skipping webhook: missing required booking fields', {
      servicePresent: Boolean(serviceSelection),
      technicianPresent: Boolean(technicianSelection),
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
  const service = await resolveService(serviceSelection);
  const technicianId = await resolveTechnician(technicianSelection);
  const startTime = toIsoStartTime(appointmentDate, timeHours, timeMinutes, flatTime);
  const durationMinutes = Number(service.duration_minutes || 60);
  const endTime = new Date(Date.parse(startTime) + durationMinutes * 60000).toISOString();

  const booking = {
    technician_id: technicianId,
    customer_id: customerId,
    service_id: service.id,
    start_time: startTime,
    end_time: endTime,
    note,
  };

  const { error } = await supabase.from('bookings').insert([booking]);
  if (error) throw error;
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

function firstSelection(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        return Array.isArray(arr) ? arr[0] || null : trimmed;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return String(value);
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

async function resolveService(selection) {
  const serviceMap = parseMapEnv('FORMINATOR_SERVICE_MAP');
  const mapped = serviceMap[selection] || serviceMap[String(selection).toLowerCase?.()];
  const key = mapped || selection;

  let query = supabase.from('services').select('id, name, duration_minutes');
  if (isUuid(key)) {
    query = query.eq('id', key);
  } else {
    query = query.ilike('name', key);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`Service not found for selection: ${selection}`);
  }
  return data;
}

async function resolveTechnician(selection) {
  const techMap = parseMapEnv('FORMINATOR_TECHNICIAN_MAP');
  const mapped = techMap[selection] || techMap[String(selection).toLowerCase?.()];
  const key = mapped || selection;

  let query = supabase.from('users').select('id, name, email').eq('role', 'technician');
  if (isUuid(key)) {
    query = query.eq('id', key);
  } else if (String(key).includes('@')) {
    query = query.ilike('email', String(key));
  } else {
    query = query.ilike('name', String(key));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(`Technician not found for selection: ${selection}`);
  }
  return data.id;
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
  let parsedHours = Number(hours);
  let parsedMinutes = Number(minutes);

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
    let hours = Number(ampmMatch[1]);
    const mins = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3];

    if (hours === 12) {
      hours = meridiem === 'AM' ? 0 : 12;
    } else if (meridiem === 'PM') {
      hours += 12;
    }

    validateTimeParts(hours, mins);

    return { hours, minutes: mins };
  }

  const match24h = source.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const hours = Number(match24h[1]);
    const minutes = Number(match24h[2]);
    validateTimeParts(hours, minutes);
    return {
      hours,
      minutes,
    };
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

export default router;
