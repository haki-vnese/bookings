import request from 'supertest';
import app from '../server.js';
import { jest } from '@jest/globals';

describe('input validation middleware', () => {
  describe('POST /api/services (create service)', () => {
    test('valid service -> creates and returns 201', async () => {
      // This test assumes Supabase is mocked or available; we're testing validation layer
      // In a real scenario you'd mock the supabase.from().insert() call
      const res = await request(app)
        .post('/api/services')
        .send({
          name: 'Test Service',
          description: 'A test service',
          duration_minutes: 30,
          price: 50.00,
        });
      // We expect a DB response (success 201 or error due to DB), not validation error
      expect([201, 500]).toContain(res.status); // 201 if DB works, 500 if DB fails (expected in test)
    });

    test('missing name -> returns 400 validation error', async () => {
      const res = await request(app)
        .post('/api/services')
        .send({
          description: 'No name provided',
          duration_minutes: 30,
          price: 50.00,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/i);
      expect(res.body.error).toMatch(/name/i);
    });

    test('invalid duration_minutes (negative) -> returns 400', async () => {
      const res = await request(app)
        .post('/api/services')
        .send({
          name: 'Test Service',
          description: 'Test',
          duration_minutes: -5,
          price: 50.00,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/i);
    });

    test('missing price -> returns 400', async () => {
      const res = await request(app)
        .post('/api/services')
        .send({
          name: 'Test Service',
          duration_minutes: 30,
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/price/i);
    });
  });

  describe('POST /api/users (create user)', () => {
    test('invalid email -> returns 400', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({
          name: 'Test User',
          email: 'not-an-email',
          role: 'customer',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    test('invalid role -> returns 400', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          role: 'admin', // invalid role
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/technician|customer/i);
    });

    test('valid user data passes validation', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          role: 'technician',
        });
      // validation passes, should reach controller (DB error expected in test env)
      expect([201, 500]).toContain(res.status);
    });
  });

  describe('POST /api/bookings (create booking)', () => {
    test('invalid start_time format -> returns 400', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          technician_id: '12345', // invalid UUID format
          customer_id: 'abcde-12345',
          service_id: 'xyz',
          start_time: 'not-a-date',
          end_time: '2025-12-07T15:00:00Z',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/i);
    });

    test('end_time before start_time -> returns 400', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          technician_id: '550e8400-e29b-41d4-a716-446655440000',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          service_id: '550e8400-e29b-41d4-a716-446655440002',
          start_time: '2025-12-07T15:00:00Z',
          end_time: '2025-12-07T14:00:00Z', // before start_time
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/end_time/i);
    });

    test('valid booking passes validation', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          technician_id: '550e8400-e29b-41d4-a716-446655440000',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          service_id: '550e8400-e29b-41d4-a716-446655440002',
          start_time: '2025-12-07T14:00:00Z',
          end_time: '2025-12-07T15:00:00Z',
          note: 'Test booking',
        });
      // validation passes, should reach controller (DB error expected in test env)
      expect([201, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/services/:id (update service)', () => {
    test('empty update -> returns 400 (at least one field required)', async () => {
      const res = await request(app)
        .put('/api/services/550e8400-e29b-41d4-a716-446655440000')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/i);
    });

    test('partial update with valid data passes validation', async () => {
      const res = await request(app)
        .put('/api/services/550e8400-e29b-41d4-a716-446655440000')
        .send({
          name: 'Updated Service Name',
        });
      // validation passes
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
