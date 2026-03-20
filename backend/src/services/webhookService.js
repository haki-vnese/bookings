/**
 * Webhook business-logic layer for Forminator form submissions.
 *
 * This service converts a raw WordPress Forminator webhook payload into
 * one or more booking rows.  The pipeline is:
 *
 *   1. Normalise the incoming payload (many possible shapes).
 *   2. Extract candidate values for salon, customer, service, technician, date/time.
 *   3. Resolve each candidate against the database (UUID → row, name → row, …).
 *   4. Build booking segment(s) — one per selected service — and insert them.
 *
 * Environment variables control mapping overrides and default values:
 *   FORMINATOR_SALON_MAP, FORMINATOR_SERVICE_MAP, FORMINATOR_TECHNICIAN_MAP
 *   FORMINATOR_DEFAULT_SALON_ID, FORMINATOR_TIMEZONE, FORMINATOR_DEDUPLICATE
 *
 * Exported symbols are grouped into:
 *   • processForminatorPayload — main orchestrator
 *   • Payload helpers          — normalizePayload, getAny, collectSelectionCandidates, …
 *   • Entity resolvers         — resolveCustomer, resolveSalonId, resolveService(s), resolveTechnician
 *   • Date/time helpers        — toIsoStartTime, parseFlatTime, …
 *   • Booking insertion        — insertBookingWithNotesFallback
 */

import { supabase } from '../db/supabase.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// ══════════════════════════════════════════════════════════════════════════
//  Main orchestrator
// ══════════════════════════════════════════════════════════════════════════

/**
 * Processes one Forminator webhook payload end-to-end.
 *
 * Called fire-and-forget from the route handler so the HTTP response
 * is not held open while DB work happens.
 */
export async function processForminatorPayload(body) {
  const normalized = normalizePayload(body);

  // ── Collect candidate field values from the normalised payload ───────
  const salonCandidates = collectSelectionCandidates(normalized, [
    'salon_id', 'salonId', 'location_id', 'locationId',
    'location', 'location_name', 'branch',
  ]);

  const customerIdInput = getAny(normalized, ['customer_id', 'customerId']);
  const customerName = getAny(normalized, [
    'name_1', 'name', 'full_name', 'customer_name', 'customerName',
  ]);
  const customerEmailRaw = getAny(normalized, [
    'email_1', 'email', 'customer_email', 'customerEmail',
  ]);
  const customerPhoneRaw = getAny(normalized, [
    'phone', 'phone_1', 'phone_number', 'customer_phone',
    'customerPhone', 'tel', 'telephone', 'mobile',
  ]);
  const notes = String(getAny(normalized, ['textarea_1', 'notes', 'note', 'message']) || '');

  const serviceCandidates = collectSelectionCandidates(normalized, [
    'service_id', 'service', 'service_name', 'service_label',
    'select_1_label', 'select_1_text', 'select_1',
  ]);

  const technicianCandidates = collectSelectionCandidates(normalized, [
    'technician_id', 'technician', 'technician_name', 'technician_label',
    'select_2_label', 'select_2_text', 'select_2',
  ]);

  const appointmentDate = getAny(normalized, ['date_1', 'appointment_date', 'date']);
  const timeHours = getAny(normalized, ['time_1_hours', 'hours']);
  const timeMinutes = getAny(normalized, ['time_1_minutes', 'minutes']);
  const flatTime = getAny(normalized, ['time_1', 'appointment_time', 'time']);

  // ── Clean & validate minimal required fields ────────────────────────
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

  // ── Resolve entities ────────────────────────────────────────────────
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
    appointmentDate, timeHours, timeMinutes, flatTime,
    process.env.FORMINATOR_TIMEZONE || process.env.BOOKING_TIMEZONE || 'UTC',
  );

  // ── Create one booking segment per service, back-to-back ────────────
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

// ══════════════════════════════════════════════════════════════════════════
//  Payload helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Extracts the webhook token from the request header or query string.
 * Supports multiple header conventions used by Forminator and generic
 * webhook proxies.
 */
export function getWebhookToken(req) {
  const headerToken = req.get('x-webhook-token') || req.get('x-forminator-token');
  const queryToken = req.query?.token;
  return String(headerToken || queryToken || '').trim();
}

/**
 * Merges nested payload structures into a flat key–value object.
 *
 * Forminator webhooks can arrive in several shapes:
 *   • Top-level fields: `{ salon_id, email, … }`
 *   • Nested under `data`, `fields`, `payload`, `form_response`, or `entry`
 *   • Fields as an array of `{ name, value }` pairs
 *
 * This function handles all variants so downstream code always works
 * with a flat object.
 */
export function normalizePayload(input) {
  if (!input || typeof input !== 'object') return {};

  const out = { ...input };
  const candidates = [input.data, input.fields, input.payload, input.form_response, input.entry];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      Object.assign(out, candidate);
    }
  }

  // Array-of-objects variant: [{ name: 'email', value: '…' }, …]
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

/**
 * Returns the first non-empty value found under any of the given keys.
 */
export function getAny(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

/**
 * Builds a de-duplicated list of candidate string values from a set of
 * possible field names.  Handles scalars, arrays, objects, JSON strings,
 * and delimited multi-select strings.
 */
export function collectSelectionCandidates(obj, keys) {
  const values = [];
  for (const key of keys) {
    pushSelectionValue(values, obj?.[key]);
  }
  return [...new Set(values.filter((v) => v && String(v).trim() !== ''))];
}

/**
 * Recursively unwraps a value into flat string candidates.
 *
 * Handles: arrays, plain objects (extracts id/value/label/text/name),
 * JSON-encoded strings, and delimited multi-select strings (`,;|\n`).
 */
function pushSelectionValue(output, value) {
  if (value === null || value === undefined || value === '') return;

  if (Array.isArray(value)) {
    for (const item of value) pushSelectionValue(output, item);
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

    // Attempt JSON parse for stringified arrays/objects.
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        pushSelectionValue(output, JSON.parse(trimmed));
        return;
      } catch {
        output.push(trimmed);
        return;
      }
    }

    // Forminator multi-select values may arrive as a single delimited string.
    if (/[\n,;|]/.test(trimmed)) {
      const parts = trimmed.split(/[\n,;|]/).map((p) => p.trim()).filter(Boolean);
      if (parts.length > 1) {
        for (const part of parts) output.push(part);
        return;
      }
    }

    output.push(trimmed);
    return;
  }

  output.push(String(value));
}

/**
 * Constructs a full name from `first_name` + `last_name` parts if present.
 */
export function buildNameFromParts(normalized) {
  const firstName = String(getAny(normalized, ['first_name', 'firstName']) || '').trim();
  const lastName = String(getAny(normalized, ['last_name', 'lastName']) || '').trim();
  return `${firstName} ${lastName}`.trim() || '';
}

// ══════════════════════════════════════════════════════════════════════════
//  Environment-variable mapping helpers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Parses a JSON-encoded environment variable into an object.
 * Returns `{}` when the variable is absent or not valid JSON.
 */
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

/**
 * Extends a list of candidate values with any mapped overrides found
 * via the environment-variable mapping table.
 *
 * For example, if the payload contains `"downtown"` and the env map has
 * `{"downtown":"<salon-uuid>"}`, the returned list includes both the
 * original value and the mapped UUID.
 */
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

/**
 * Generates normalised variants of a value for fuzzy map lookups.
 *
 * Example: `"Hair Tastic"` → `["Hair Tastic", "hair tastic", "hair_tastic", "hair-tastic", "hairtastic"]`
 * Also handles `option-N` / `option_N` patterns from Forminator selects.
 */
function buildLookupKeys(value) {
  const source = String(value || '').trim();
  if (!source) return [];

  const lower = source.toLowerCase();
  const underscored = lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dashed = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const compact = lower.replace(/[^a-z0-9]+/g, '');

  const keys = new Set([source, lower, underscored, dashed, compact]);

  // Forminator select fields may use "option-1", "option_2", etc.
  const optionMatch = lower.match(/^option[-_\s]?(\d+)$/);
  if (optionMatch) {
    const index = optionMatch[1];
    keys.add(index);
    keys.add(`option_${index}`);
    keys.add(`option-${index}`);
  }

  return [...keys].filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════════
//  Entity resolvers
// ══════════════════════════════════════════════════════════════════════════

/**
 * Resolves (or creates) a customer row from the webhook data.
 *
 * Resolution waterfall:
 *   1. By explicit `customer_id` UUID.
 *   2. By email match within the salon scope.
 *   3. Creates a new customer row when no match is found.
 *
 * In cases 1 & 2 missing name/phone fields on the existing row are
 * back-filled from the incoming data.
 */
export async function resolveCustomer({ customerId, email, name, phone, salonId }) {
  // ── Attempt 1: direct UUID lookup ───────────────────────────────────
  if (customerId && isUuid(customerId)) {
    let byIdQuery = supabase.from('customers').select('id, name, email, phone').eq('id', customerId);
    if (salonId) byIdQuery = byIdQuery.eq('salon_id', salonId);
    const { data: existingById, error: byIdError } = await byIdQuery.maybeSingle();

    if (byIdError) throw byIdError;
    if (existingById?.id) {
      await backfillCustomerFields(existingById, { name, phone });
      return existingById.id;
    }
  }

  if (!email) {
    throw new Error('Customer email is required when customer_id is not resolvable');
  }

  // ── Attempt 2: email match ──────────────────────────────────────────
  let existingQuery = supabase.from('customers').select('id, name, phone').eq('email', email);
  if (salonId) existingQuery = existingQuery.eq('salon_id', salonId);
  const { data: existing, error: selectError } = await existingQuery.maybeSingle();

  if (selectError) throw selectError;
  if (existing?.id) {
    await backfillCustomerFields(existing, { name, phone });
    return existing.id;
  }

  // ── Attempt 3: create new customer row ──────────────────────────────
  const effectiveSalonId = salonId || process.env.FORMINATOR_DEFAULT_SALON_ID || (await resolveSingleSalonId());
  if (!effectiveSalonId) {
    throw new Error(
      'salon_id is required. Provide it in webhook payload or set FORMINATOR_DEFAULT_SALON_ID. ' +
      'For multi-salon setup, also configure FORMINATOR_SALON_MAP.',
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

/**
 * Back-fills nullable customer fields (name, phone) when the existing
 * row has blanks but the webhook payload supplies values.
 */
async function backfillCustomerFields(existing, { name, phone }) {
  const updates = {};
  if (name && !existing.name) updates.name = name;
  if (phone && !existing.phone) updates.phone = phone;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from('customers').update(updates).eq('id', existing.id);
  if (error) throw error;
}

/**
 * Resolves a salon UUID from the webhook's candidate values.
 *
 * Resolution waterfall:
 *   1. UUID match in `salons.id`.
 *   2. Exact (case-insensitive) name match.
 *   3. Partial (LIKE) name match — only when exactly one row matches.
 *   4. Falls back to `FORMINATOR_DEFAULT_SALON_ID` env var.
 *   5. Falls back to single-salon mode (only salon in DB).
 */
export async function resolveSalonId(candidates) {
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
    const { data, error } = await supabase.from('salons').select('id, name').ilike('name', String(value)).limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0].id;
    if (data?.length > 1) {
      throw new Error(`Salon selection is ambiguous for '${value}'. Set FORMINATOR_SALON_MAP, e.g. {"downtown":"<salon-uuid>"}.`);
    }
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase.from('salons').select('id, name').ilike('name', `%${value}%`).limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0].id;
  }

  if (defaultSalonId) return defaultSalonId;

  // Single-salon mode: use the only salon in the database automatically.
  return await resolveSingleSalonId();
}

/**
 * Returns the salon UUID when exactly one salon exists in the database.
 * Used as a last-resort fallback for single-location deployments.
 */
async function resolveSingleSalonId() {
  const { data, error } = await supabase.from('salons').select('id').limit(2);
  if (error) throw error;
  if (data?.length === 1) return data[0].id;
  return null;
}

/**
 * Resolves a single service row from one or more candidate values.
 * Tries UUID match → exact name → partial name.
 */
async function resolveService(candidates) {
  const serviceMap = parseMapEnv('FORMINATOR_SERVICE_MAP');
  const valuesToTry = withMappedValues(candidates, serviceMap);

  for (const value of valuesToTry) {
    if (!isUuid(value)) continue;
    const { data, error } = await supabase.from('services').select('id, name, duration_minutes').eq('id', value).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase.from('services').select('id, name, duration_minutes').ilike('name', value).limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0];
    if (data?.length > 1) {
      throw new Error(`Service selection is ambiguous for '${value}'. Set FORMINATOR_SERVICE_MAP, e.g. {"one":"<service-uuid>"}.`);
    }
  }

  for (const value of valuesToTry) {
    const { data, error } = await supabase.from('services').select('id, name, duration_minutes').ilike('name', `%${value}%`).limit(2);
    if (error) throw error;
    if (data?.length === 1) return data[0];
  }

  throw new Error(`Service not found for selection: ${candidates[0]}. Set FORMINATOR_SERVICE_MAP, e.g. {"one":"<service-uuid>"}.`);
}

/**
 * Resolves one or more services from the candidate list.
 *
 * Each candidate is tried individually first; if none resolve, a
 * combined fallback pass is attempted.  This handles both multi-select
 * and single-select Forminator fields.
 */
export async function resolveServices(candidates) {
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

/**
 * Resolves a technician (staff user) UUID.
 * Tries UUID match → email/name match, always within salon scope when provided.
 */
export async function resolveTechnician(candidates, salonId) {
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
      throw new Error(`Technician selection is ambiguous for '${value}'. Set FORMINATOR_TECHNICIAN_MAP, e.g. {"one":"<technician-uuid>"}.`);
    }
  }

  throw new Error(`Technician not found for selection: ${candidates[0]}. Set FORMINATOR_TECHNICIAN_MAP, e.g. {"one":"<technician-uuid>"}.`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Date / time helpers
// ══════════════════════════════════════════════════════════════════════════

/** Zero-pads a number to two digits: `9 → "09"`, `12 → "12"`. */
function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Converts the webhook's date + time values into an ISO-8601 string.
 *
 * Supports:
 *   • `YYYY-MM-DD` date with separate hours/minutes fields
 *   • `MM/DD/YYYY` (US format) with separate hours/minutes fields
 *   • Full datetime string (passed through dayjs with timezone)
 */
export function toIsoStartTime(dateString, hours, minutes, flatTime, timeZone) {
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
      .tz(`${year}-${pad2(month)}-${pad2(day)} ${pad2(parsed.hours)}:${pad2(parsed.minutes)}`, 'YYYY-MM-DD HH:mm', tz)
      .toISOString();
  }

  const zoned = dayjs.tz(dateValue, tz);
  if (zoned.isValid()) return zoned.toISOString();

  const fromDate = dayjs(dateValue);
  if (!fromDate.isValid()) throw new Error(`Invalid date format: ${dateString}`);
  return fromDate.toISOString();
}

/**
 * Resolves hour + minute from either separate fields or a flat time string.
 */
function resolveHourMinute(hours, minutes, flatTime) {
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (Number.isFinite(parsedHours) && Number.isFinite(parsedMinutes)) {
    validateTimeParts(parsedHours, parsedMinutes);
    return { hours: parsedHours, minutes: parsedMinutes };
  }

  return parseFlatTime(flatTime);
}

/**
 * Parses a time string like `"2:30 PM"`, `"14:30"`, or `""` → `{ hours, minutes }`.
 * Defaults to 9:00 AM when the input is empty.
 */
export function parseFlatTime(value) {
  const source = String(value || '').trim().toUpperCase();

  // 12-hour format: "2:30 PM"
  const ampmMatch = source.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampmMatch) {
    let h = Number(ampmMatch[1]);
    const m = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3];
    if (h === 12) h = meridiem === 'AM' ? 0 : 12;
    else if (meridiem === 'PM') h += 12;
    validateTimeParts(h, m);
    return { hours: h, minutes: m };
  }

  // 24-hour format: "14:30"
  const match24h = source.match(/^(\d{1,2}):(\d{2})$/);
  if (match24h) {
    const h = Number(match24h[1]);
    const m = Number(match24h[2]);
    validateTimeParts(h, m);
    return { hours: h, minutes: m };
  }

  // Empty → default morning slot
  if (!source) return { hours: 9, minutes: 0 };

  throw new Error(`Invalid time format: ${value}`);
}

// ══════════════════════════════════════════════════════════════════════════
//  Booking insertion
// ══════════════════════════════════════════════════════════════════════════

/**
 * Inserts a booking row with graceful column-name fallback.
 *
 * The notes column has been named `notes`, `note`, or omitted entirely
 * across different DB versions.  This function tries each variant and
 * falls back to inserting without notes if neither column exists.
 *
 * Deduplication is enabled by default (controlled by
 * `FORMINATOR_DEDUPLICATE` env var).  A booking is considered a
 * duplicate when all five key fields match an existing row.
 */
export async function insertBookingWithNotesFallback(bookingBase, notes) {
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

  // Try `notes` column first, fall back to `note`, then no notes column.
  const bookingWithNotes = { ...bookingBase, notes };
  const { error } = await supabase.from('bookings').insert([bookingWithNotes]);
  if (!error) return;
  if (!isMissingColumnError(error, 'notes')) throw error;

  const bookingWithNote = { ...bookingBase, note: notes };
  const { error: noteFallbackError } = await supabase.from('bookings').insert([bookingWithNote]);
  if (!noteFallbackError) return;
  if (!isMissingColumnError(noteFallbackError, 'note')) throw noteFallbackError;

  const { error: plainFallbackError } = await supabase.from('bookings').insert([bookingBase]);
  if (plainFallbackError) throw plainFallbackError;
}

// ══════════════════════════════════════════════════════════════════════════
//  Utility helpers
// ══════════════════════════════════════════════════════════════════════════

/** Returns true when the value is a valid UUID v1–v5. */
export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function validateTimeParts(hours, minutes) {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error('Invalid time parts');
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid time format');
  }
}

/**
 * Detects PostgREST "column not found" errors by code + message.
 * Used to implement the notes/note column fallback strategy.
 */
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
