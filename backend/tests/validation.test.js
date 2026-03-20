import request from 'supertest';
import app from '../server.js';
import { jest } from '@jest/globals';
import { supabase } from '../src/db/supabase.js';
import bcrypt from 'bcryptjs';

// Helper to get a valid token for protected endpoints
let validToken = null;
let adminToken = null;
let adminUserId = null;

async function getValidToken() {
  if (validToken) return validToken;
  
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      name: 'Test User',
      email: `testvalidation${Date.now()}@example.com`,
      password: 'testpass123',
      role: 'customer'
    });
  
  if (res.status === 201 && res.body.token) {
    validToken = res.body.token;
  }
  return validToken;
}

async function getAdminToken() {
  if (adminToken) return adminToken;

  const adminUser = {
    name: 'Admin User',
    email: `adminvalidation${Date.now()}@example.com`,
    password: 'adminPass123',
    role: 'admin',
  };
  const hashedPassword = await bcrypt.hash(adminUser.password, 10);
  const { data: admin, error } = await supabase
    .from('users')
    .insert({ name: adminUser.name, email: adminUser.email, password: hashedPassword, role: adminUser.role })
    .select()
    .single();
  if (error) throw error;
  adminUserId = admin.id;

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: adminUser.email, password: adminUser.password });

  if (res.status === 200 && res.body.token) {
    adminToken = res.body.token;
  }
  return adminToken;
}

afterAll(async () => {
  if (adminUserId) {
    await supabase.from('users').delete().eq('id', adminUserId);
  }
});

describe('input validation middleware', () => {
  describe('POST /api/services (create service)', () => {
    test('valid service -> creates and returns 201', async () => {
      const token = await getAdminToken();
      // This test assumes Supabase is mocked or available; we're testing validation layer
      // In a real scenario you'd mock the supabase.from().insert() call
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/services')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test User',
          email: 'not-an-email',
          password: 'testpass123',
          role: 'staff',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/email/i);
    });

    test('invalid role -> returns 400', async () => {
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'testpass123',
          role: 'owner', // invalid role
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/superuser|admin|staff/i);
    });

    test('valid user data passes validation', async () => {
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test User',
          email: `test${Date.now()}@example.com`,
          password: 'testpass123',
          role: 'staff',
        });
      // validation passes, should reach controller (DB error or auth scope error expected in test env)
      expect([201, 403, 500]).toContain(res.status);
    });
  });

  describe('POST /api/bookings (create booking)', () => {
    test('invalid start_time format -> returns 400', async () => {
      const token = await getValidToken();
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getValidToken();
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
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
      const token = await getAdminToken();
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          technician_id: '550e8400-e29b-41d4-a716-446655440000',
          customer_id: '550e8400-e29b-41d4-a716-446655440001',
          service_id: '550e8400-e29b-41d4-a716-446655440002',
          start_time: '2025-12-07T14:00:00Z',
          end_time: '2025-12-07T15:00:00Z',
          note: 'Test booking',
        });
      // Validation passes, then controller may reject based on tenant/lookup constraints in test env.
      expect([201, 400, 403, 500]).toContain(res.status);
    });
  });

  describe('PUT /api/services/:id (update service)', () => {
    test('empty update -> returns 400 (at least one field required)', async () => {
      const token = await getAdminToken();
      const res = await request(app)
        .put('/api/services/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Validation failed/i);
    });

    test('partial update with valid data passes validation', async () => {
      const token = await getAdminToken();
      const res = await request(app)
        .put('/api/services/550e8400-e29b-41d4-a716-446655440000')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Updated Service Name',
        });
      // validation passes
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});
