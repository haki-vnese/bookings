import express from 'express';
import { supabase } from '../db/supabase.js';

const router = express.Router();

router.post('/forminator', (req, res) => {
  // Optional token check. If env var is not set, skip auth.
  const expected = process.env.FORMINATOR_WEBHOOK_TOKEN;
  if (expected && req.query.token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Always acknowledge quickly so Forminator doesn't timeout.
  const payload = { ...req.body };
  res.status(200).json({ ok: true });

  // Process in background
  processForminatorPayload(payload).catch((err) => {
    console.error('Forminator webhook processing error:', err);
  });
});

async function processForminatorPayload(body) {
  console.log('Forminator payload:', body);

  // Adjust these field names to your actual Forminator field keys.
  const technicianId = pick(body, ['technician_id', 'technicianId', 'tech_id']);
  const customerId = pick(body, ['customer_id', 'customerId']);
  const serviceId = pick(body, ['service_id', 'serviceId']);
  const note = pick(body, ['note', 'notes', 'message']) || '';

  // Either provide start/end directly, or send date+time and compute end_time.
  const startTimeRaw = pick(body, ['start_time', 'startTime']);
  const endTimeRaw = pick(body, ['end_time', 'endTime']);

  const appointmentDate = pick(body, ['appointment_date', 'date']);
  const appointmentTime = pick(body, ['appointment_time', 'time']);
  const durationMinutes = Number(pick(body, ['duration_minutes', 'duration']) || 60);

  let startTime = startTimeRaw;
  let endTime = endTimeRaw;

  if (!startTime && appointmentDate && appointmentTime) {
    startTime = new Date(`${appointmentDate}T${appointmentTime}:00`).toISOString();
    endTime = new Date(new Date(startTime).getTime() + durationMinutes * 60000).toISOString();
  }

  if (!technicianId || !customerId || !serviceId || !startTime || !endTime) {
    console.warn('Skipping insert: missing required booking fields');
    return;
  }

  const booking = {
    technician_id: technicianId,
    customer_id: customerId,
    service_id: serviceId,
    start_time: startTime,
    end_time: endTime,
    note,
  };

  const { error } = await supabase.from('bookings').insert([booking]);
  if (error) throw error;
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

export default router;
