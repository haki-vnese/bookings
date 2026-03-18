import express from 'express';
import { supabase } from '../db/supabase.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const router = express.Router();

router.post('/forminator', (req, res) => {
  const expected = process.env.FORMINATOR_WEBHOOK_TOKEN;
  const providedToken = getWebhookToken(req);
  if (expected && providedToken !== expected) {
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

  const salonCandidates = collectSelectionCandidates(normalized, [
    'salon_id',
    'salonId',
    'location_id',
    'locationId',
    'location',
    'location_name',
    'branch',
  ]);

  const customerIdInput = getAny(normalized, ['customer_id', 'customerId']);
  const customerName = getAny(normalized, [
    'name_1',
    'name',
    'full_name',
    'customer_name',
    'customerName',
  ]);
  const customerEmailRaw = getAny(normalized, [
    'email_1',
    'email',
    'customer_email',
    'customerEmail',
  ]);
  const customerPhoneRaw = getAny(normalized, [
    'phone',
    'phone_1',
    'phone_number',
    'customer_phone',
    'customerPhone',
    'tel',
    'telephone',
    'mobile',
  ]);
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
  const customerPhone = typeof customerPhoneRaw === 'string' ? customerPhoneRaw.trim() : null;
  const customerNameClean = typeof customerName === 'string' ? customerName.trim() : '';
  const resolvedName = customerNameClean || buildNameFromParts(normalized) || customerEmail;
  const salonId = await resolveSalonId(salonCandidates);

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
    name: resolvedName,
    phone: customerPhone,
    salonId,
  });

  const services = await resolveServices(serviceCandidates);
  const technicianId = await resolveTechnician(technicianCandidates, salonId);
  const startTime = toIsoStartTime(
    appointmentDate,
    timeHours,
    timeMinutes,
    flatTime,
    process.env.FORMINATOR_TIMEZONE || process.env.BOOKING_TIMEZONE || 'UTC'
  );
  let cursorMs = Date.parse(startTime);

  for (const service of services) {
    const durationMinutes = Number(service.duration_minutes || 60);
    const segmentStart = new Date(cursorMs).toISOString();
    const segmentEnd = new Date(cursorMs + durationMinutes * 60000).toISOString();

    const bookingBase = {
      technician_id: technicianId,
      customer_id: customerId,
      service_id: service.id,
      start_time: segmentStart,
      end_time: segmentEnd,
    };

    await insertBookingWithNotesFallback(bookingBase, notes);
    cursorMs += durationMinutes * 60000;
  }
}

function getWebhookToken(req) {
  const headerToken = req.get('x-webhook-token') || req.get('x-forminator-token');
  const queryToken = req.query?.token;
  return String(headerToken || queryToken || '').trim();
}

function buildNameFromParts(normalized) {
  const firstName = String(getAny(normalized, ['first_name', 'firstName']) || '').trim();
  const lastName = String(getAny(normalized, ['last_name', 'lastName']) || '').trim();
  const name = `${firstName} ${lastName}`.trim();
  return name || '';
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

    // Forminator multi-select values may arrive as a single delimited string.
    if (/[\n,;|]/.test(trimmed)) {
      const parts = trimmed
        .split(/[\n,;|]/)
        .map((part) => part.trim())
        .filter(Boolean);

      if (parts.length > 1) {
        for (const part of parts) {
          output.push(part);
        }
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

    for (const lookupKey of buildLookupKeys(key)) {
      if (!Object.prototype.hasOwnProperty.call(map, lookupKey)) continue;
      const mappedValue = String(map[lookupKey] || '').trim();
      if (mappedValue) out.push(mappedValue);
    }
  }

  return [...new Set(out.filter(Boolean))];
}

function buildLookupKeys(value) {
  const source = String(value || '').trim();
  if (!source) return [];

  const lower = source.toLowerCase();
  const underscored = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dashed = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const compact = lower.replace(/[^a-z0-9]+/g, '');

  const keys = new Set([source, lower, underscored, dashed, compact]);
  const optionMatch = lower.match(/^option[-_\s]?(\d+)$/);
  if (optionMatch) {
    const index = optionMatch[1];
    keys.add(index);
    keys.add(`option_${index}`);
    keys.add(`option-${index}`);
  }

  return [...keys].filter(Boolean);
}

async function resolveCustomer({ customerId, email, name, phone, salonId }) {
  if (customerId && isUuid(customerId)) {
    let byIdQuery = supabase.from('customers').select('id, name, email, phone').eq('id', customerId);
    if (salonId) byIdQuery = byIdQuery.eq('salon_id', salonId);
    const { data: existingById, error: byIdError } = await byIdQuery.maybeSingle();

    if (byIdError) throw byIdError;
    if (existingById?.id) {
      const updateById = {};
      if (name && !existingById.name) updateById.name = name;
      if (phone && !existingById.phone) updateById.phone = phone;
      if (Object.keys(updateById).length > 0) {
        const { error: updateByIdError } = await supabase
          .from('customers')
          .update(updateById)
          .eq('id', existingById.id);
        if (updateByIdError) throw updateByIdError;
      }
      return existingById.id;
    }
  }

  if (!email) {
    throw new Error('Customer email is required when customer_id is not resolvable');
  }

  let existingQuery = supabase.from('customers').select('id, name, phone').eq('email', email);
  if (salonId) existingQuery = existingQuery.eq('salon_id', salonId);
  const { data: existing, error: selectError } = await existingQuery.maybeSingle();

  if (selectError) throw selectError;
  if (existing?.id) {
    const updates = {};
    if (name && !existing.name) updates.name = name;
    if (phone && !existing.phone) updates.phone = phone;
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase.from('customers').update(updates).eq('id', existing.id);
      if (updateError) throw updateError;
    }
    return existing.id;
  }

  const effectiveSalonId = salonId || process.env.FORMINATOR_DEFAULT_SALON_ID || (await resolveSingleSalonId());
  if (!effectiveSalonId) {
    throw new Error(
      'salon_id is required. Provide it in webhook payload or set FORMINATOR_DEFAULT_SALON_ID. For multi-salon setup, also configure FORMINATOR_SALON_MAP.'
    );
  }

  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert([{ name: name || email, email, phone: phone || null, salon_id: effectiveSalonId }])
    .select('id')
    .single();
  if (createError) throw createError;
  return created.id;
}

async function resolveSalonId(candidates) {
  const defaultSalonId = process.env.FORMINATOR_DEFAULT_SALON_ID;
  const salonMap = parseMapEnv('FORMINATOR_SALON_MAP');
  const valuesToTry = withMappedValues(candidates, salonMap);

  for (const value of valuesToTry) {
    if (!isUuid(value)) continue;

    const { data, error } = await supabase.from('salons').select('id').eq('id', value).maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id;
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase
      .from('salons')
      .select('id, name')
      .ilike('name', String(value))
      .limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0].id;
    if (data?.length > 1) {
      throw new Error(
        `Salon selection is ambiguous for '${value}'. Set FORMINATOR_SALON_MAP, e.g. {"downtown":"<salon-uuid>"}.`
      );
    }
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase
      .from('salons')
      .select('id, name')
      .ilike('name', `%${value}%`)
      .limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0].id;
  }

  if (defaultSalonId) return defaultSalonId;

  // Single-salon mode: if there is exactly one salon in DB, use it automatically.
  return await resolveSingleSalonId();
}

async function resolveSingleSalonId() {
  const { data, error } = await supabase.from('salons').select('id').limit(2);
  if (error) throw error;
  if (data?.length === 1) return data[0].id;
  return null;
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

async function resolveServices(candidates) {
  const resolvedById = new Map();

  for (const candidate of candidates) {
    try {
      const service = await resolveService([candidate]);
      if (service?.id && !resolvedById.has(service.id)) {
        resolvedById.set(service.id, service);
      }
    } catch (error) {
      if (!isServiceResolutionFailure(error)) throw error;
    }
  }

  if (resolvedById.size === 0) {
    const fallback = await resolveService(candidates);
    resolvedById.set(fallback.id, fallback);
  }

  return [...resolvedById.values()];
}

async function resolveTechnician(candidates, salonId) {
  const techMap = parseMapEnv('FORMINATOR_TECHNICIAN_MAP');
  const valuesToTry = withMappedValues(candidates, techMap);

  for (const value of valuesToTry) {
    if (!isUuid(value)) continue;

    let query = supabase.from('users').select('id, name, email').eq('role', 'staff').eq('id', value);
    if (salonId) query = query.eq('salon_id', salonId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) return data.id;
  }

  for (const value of valuesToTry) {
    let query = supabase.from('users').select('id, name, email').eq('role', 'staff');
    if (salonId) query = query.eq('salon_id', salonId);
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

function toIsoStartTime(dateString, hours, minutes, flatTime, timeZone) {
  const dateValue = String(dateString).trim();
  const tz = String(timeZone || 'UTC').trim() || 'UTC';

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const parsed = resolveHourMinute(hours, minutes, flatTime);
    return dayjs
      .tz(`${dateValue} ${pad2(parsed.hours)}:${pad2(parsed.minutes)}`, 'YYYY-MM-DD HH:mm', tz)
      .toISOString();
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateValue)) {
    const parsed = resolveHourMinute(hours, minutes, flatTime);
    const [month, day, year] = dateValue.split('/').map(Number);
    return dayjs
      .tz(
        `${year}-${pad2(month)}-${pad2(day)} ${pad2(parsed.hours)}:${pad2(parsed.minutes)}`,
        'YYYY-MM-DD HH:mm',
        tz
      )
      .toISOString();
  }

  const zoned = dayjs.tz(dateValue, tz);
  if (zoned.isValid()) {
    return zoned.toISOString();
  }

  const fromDate = dayjs(dateValue);
  if (!fromDate.isValid()) {
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

function isServiceResolutionFailure(error) {
  const message = String(error?.message || '');
  return message.startsWith('Service not found for selection:');
}

async function insertBookingWithNotesFallback(bookingBase, notes) {
  const shouldDedupe = String(process.env.FORMINATOR_DEDUPLICATE || 'true').toLowerCase() !== 'false';
  if (shouldDedupe) {
    const { data: existing, error: selectError } = await supabase
      .from('bookings')
      .select('id')
      .eq('technician_id', bookingBase.technician_id)
      .eq('customer_id', bookingBase.customer_id)
      .eq('service_id', bookingBase.service_id)
      .eq('start_time', bookingBase.start_time)
      .eq('end_time', bookingBase.end_time)
      .limit(1)
      .maybeSingle();

    if (selectError) throw selectError;
    if (existing?.id) return;
  }

  const bookingWithNotes = { ...bookingBase, notes };
  const { error } = await supabase.from('bookings').insert([bookingWithNotes]);
  if (!error) return;

  if (!isMissingColumnError(error, 'notes')) {
    throw error;
  }

  const bookingWithNote = { ...bookingBase, note: notes };
  const { error: noteFallbackError } = await supabase.from('bookings').insert([bookingWithNote]);
  if (!noteFallbackError) return;

  if (!isMissingColumnError(noteFallbackError, 'note')) {
    throw noteFallbackError;
  }

  const { error: plainFallbackError } = await supabase.from('bookings').insert([bookingBase]);
  if (plainFallbackError) {
    throw plainFallbackError;
  }
}

export default router;
