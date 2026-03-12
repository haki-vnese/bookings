import request from 'supertest';
import app from '../server.js';
import { supabase } from '../src/db/supabase.js';

describe('Availability Controller', () => {
  let technicianId, customerId, serviceId, salonId;

  beforeAll(async () => {
    // Create a test salon for tenant-linked entities
    const { data: salon, error: salonError } = await supabase
      .from('salons')
      .insert({ name: `Test Salon ${Date.now()}` })
      .select()
      .single();
    if (salonError) throw salonError;
    salonId = salon.id;

    // Create test technician
    const { data: tech } = await supabase.from('users')
      .insert({ name: 'Test Technician', email: `tech-${Date.now()}@test.com`, role: 'staff', salon_id: salonId })
      .select().single();
    technicianId = tech.id;

    // Create test customer
    const { data: cust } = await supabase.from('customers')
      .insert({ name: 'Test Customer', email: `cust-${Date.now()}@test.com`, salon_id: salonId })
      .select().single();
    customerId = cust.id;

    // Create test service (60 min duration)
    const { data: svc } = await supabase.from('services')
      .insert({ name: 'Test Service', duration_minutes: 60, price: 100 })
      .select().single();
    serviceId = svc.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('bookings')
      .delete()
      .eq('technician_id', technicianId);
    
    await supabase.from('users').delete().eq('id', technicianId);

    await supabase.from('customers').delete().eq('id', customerId);

    await supabase.from('salons').delete().eq('id', salonId);
    
    await supabase.from('services')
      .delete()
      .eq('id', serviceId);
  });

  test('should return full day availability when no bookings', async () => {
    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: '2026-02-01', serviceId });

    expect(res.status).toBe(200);
    expect(res.body.availableSlots).toBeDefined();
    expect(Array.isArray(res.body.availableSlots)).toBe(true);
    expect(res.body.availableSlots.length).toBeGreaterThan(0);
    
    // Should have start and end times
    expect(res.body.availableSlots[0]).toHaveProperty('start');
    expect(res.body.availableSlots[0]).toHaveProperty('end');
    
    // First slot should start at 09:00 and end at 10:00 (60 min service)
    expect(res.body.availableSlots[0].start).toBe('09:00');
    expect(res.body.availableSlots[0].end).toBe('10:00');
  });

  test('should exclude booked time slots', async () => {
    const testDate = '2026-02-02';
    
    // Create a booking from 11:00 to 12:00
    await supabase.from('bookings').insert({
      technician_id: technicianId,
      customer_id: customerId,
      service_id: serviceId,
      start_time: `${testDate}T11:00:00Z`,
      end_time: `${testDate}T12:00:00Z`
    });

    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: testDate, serviceId });

    expect(res.status).toBe(200);
    const slotTimes = res.body.availableSlots.map(s => s.start);
    
    // 11:00 should NOT be available
    expect(slotTimes).not.toContain('11:00');
    // 10:00 should be available (ends before booked time)
    expect(slotTimes).toContain('10:00');
    // 12:00 should be available (starts after booked time)
    expect(slotTimes).toContain('12:00');

    // Cleanup
    await supabase.from('bookings')
      .delete()
      .eq('technician_id', technicianId)
      .eq('start_time', `${testDate}T11:00:00Z`);
  });

  test('should return proper start and end time format', async () => {
    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: '2026-02-03', serviceId });

    expect(res.status).toBe(200);
    res.body.availableSlots.forEach(slot => {
      expect(slot.start).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.end).toMatch(/^\d{2}:\d{2}$/);
    });
  });

  test('should require date and serviceId parameters', async () => {
    const res = await request(app)
      .get(`/api/availability/${technicianId}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Date and serviceId');
  });

  test('should handle multiple consecutive bookings', async () => {
    const testDate = '2026-02-04';
    
    // Create two back-to-back bookings
    const { data: bookings } = await supabase.from('bookings').insert([
      {
        technician_id: technicianId,
        customer_id: customerId,
        service_id: serviceId,
        start_time: `${testDate}T10:00:00Z`,
        end_time: `${testDate}T11:00:00Z`
      },
      {
        technician_id: technicianId,
        customer_id: customerId,
        service_id: serviceId,
        start_time: `${testDate}T11:00:00Z`,
        end_time: `${testDate}T12:00:00Z`
      }
    ]).select();

    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: testDate, serviceId });

    expect(res.status).toBe(200);
    const slotTimes = res.body.availableSlots.map(s => s.start);
    
    // 10:00 and 11:00 should not be available
    expect(slotTimes).not.toContain('10:00');
    expect(slotTimes).not.toContain('11:00');
    // 12:00 should be available
    expect(slotTimes).toContain('12:00');

    // Cleanup
    await supabase.from('bookings')
      .delete()
      .eq('technician_id', technicianId)
      .gte('start_time', `${testDate}T10:00:00Z`);
  });

  test('should respect different service durations', async () => {
    // Create a 30-minute service
    const { data: shortService } = await supabase.from('services')
      .insert({ name: '30 Min Service', duration_minutes: 30, price: 50 })
      .select().single();

    const testDate = '2026-02-05';

    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: testDate, serviceId: shortService.id });

    expect(res.status).toBe(200);
    expect(res.body.availableSlots.length).toBeGreaterThan(0);
    
    // Should generate 30-minute slots
    expect(res.body.availableSlots[0].start).toBe('09:00');
    expect(res.body.availableSlots[0].end).toBe('09:30');
    expect(res.body.availableSlots[1].start).toBe('09:30');
    expect(res.body.availableSlots[1].end).toBe('10:00');

    // Cleanup
    await supabase.from('services').delete().eq('id', shortService.id);
  });

  test('should return empty slots for fully booked day', async () => {
    const testDate = '2026-02-06';

    // Book the entire day (9 AM to 6 PM = 9 hours = 9 one-hour slots)
    const bookings = [];
    for (let hour = 9; hour < 18; hour++) {
      bookings.push({
        technician_id: technicianId,
        customer_id: customerId,
        service_id: serviceId,
        start_time: `${testDate}T${String(hour).padStart(2, '0')}:00:00Z`,
        end_time: `${testDate}T${String(hour + 1).padStart(2, '0')}:00:00Z`
      });
    }
    await supabase.from('bookings').insert(bookings);

    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: testDate, serviceId });

    expect(res.status).toBe(200);
    expect(res.body.availableSlots.length).toBe(0);

    // Cleanup
    await supabase.from('bookings')
      .delete()
      .eq('technician_id', technicianId)
      .gte('start_time', `${testDate}T09:00:00Z`);
  });

  test('should return 404 for non-existent service', async () => {
    const res = await request(app)
      .get(`/api/availability/${technicianId}`)
      .query({ date: '2026-02-07', serviceId: '550e8400-e29b-41d4-a716-446655440099' });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('Service not found');
  });
});
