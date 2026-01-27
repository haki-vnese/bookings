import request from 'supertest';
import app from '../server.js';
import { supabase } from '../src/db/supabase.js';
import bcrypt from 'bcryptjs';

/**
 * Authentication Flow Tests
 * Tests the complete flow: register → login → protected routes
 */
describe('Authentication Flow', () => {
    let token;
    let userId;
    let adminToken;
    let adminUserId;
    const testUser = {
        name: 'Test User',
        email: `testuser${Date.now()}@example.com`,
        password: 'testPassword123',
        role: 'customer'
    };
    const adminUser = {
        name: 'Admin User',
        email: `admin${Date.now()}@example.com`,
        password: 'adminPass123',
        role: 'admin'
    };

    beforeAll(async () => {
        const hashedPassword = await bcrypt.hash(adminUser.password, 10);
        const { data: admin, error } = await supabase
            .from('users')
            .insert({ name: adminUser.name, email: adminUser.email, password: hashedPassword, role: adminUser.role })
            .select()
            .single();
        if (error) throw error;
        adminUserId = admin.id;

        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email: adminUser.email, password: adminUser.password });
        if (loginRes.status !== 200) {
            throw new Error('Admin login failed in test setup');
        }
        adminToken = loginRes.body.token;
    });

    afterAll(async () => {
        if (adminUserId) {
            await supabase.from('users').delete().eq('id', adminUserId);
        }
    });

    // Test registration
    describe('POST /api/auth/register', () => {
        it('should register a new user and return token', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send(testUser);

            expect(res.status).toBe(201);
            expect(res.body).toHaveProperty('message', 'User registered successfully');
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('id');
            expect(res.body.user).toHaveProperty('email', testUser.email);
            expect(res.body.user).toHaveProperty('role', testUser.role);
            
            token = res.body.token;
            userId = res.body.user.id;
        });

        it('should reject duplicate email', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send(testUser);

            expect(res.status).toBe(409);
            expect(res.body.error).toContain('already registered');
        });

        it('should reject invalid password (too short)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    ...testUser,
                    email: `newuser${Date.now()}@example.com`,
                    password: '123'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('at least 6 characters');
        });

        it('should reject invalid email', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    ...testUser,
                    email: 'invalid-email',
                    password: testUser.password
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('valid email');
        });

        it('should reject invalid role', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    ...testUser,
                    email: `roletest${Date.now()}@example.com`,
                    role: 'admin'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toContain('technician');
        });
    });

    // Test login
    describe('POST /api/auth/login', () => {
        it('should login user with correct credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('token');
            expect(res.body.user).toHaveProperty('email', testUser.email);
            expect(res.body.user).not.toHaveProperty('password');
            
            token = res.body.token;
        });

        it('should reject wrong password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testUser.email,
                    password: 'wrongPassword'
                });

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Invalid email or password');
        });

        it('should reject non-existent email', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'anyPassword'
                });

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Invalid email or password');
        });
    });

    // Test protected routes
    describe('Protected Routes with JWT', () => {
        it('should get current user with valid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('id');
            expect(res.body).toHaveProperty('email', testUser.email);
            expect(res.body).not.toHaveProperty('password');
        });

        it('should reject request without token', async () => {
            const res = await request(app)
                .get('/api/auth/me');

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('No token provided');
        });

        it('should reject request with invalid token', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid_token_xyz');

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Invalid or expired token');
        });

        it('should reject request with malformed authorization header', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'InvalidFormat');

            expect(res.status).toBe(401);
        });
    });

    // Test token verification
    describe('POST /api/auth/verify', () => {
        it('should verify valid token', async () => {
            const res = await request(app)
                .post('/api/auth/verify')
                .send({ token });

            expect(res.status).toBe(200);
            expect(res.body.valid).toBe(true);
            expect(res.body.user).toHaveProperty('userId');
        });

        it('should reject invalid token', async () => {
            const res = await request(app)
                .post('/api/auth/verify')
                .send({ token: 'invalid_token' });

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('Invalid or expired token');
        });
    });

    // Test protected user operations
    describe('Protected User Operations', () => {
        it('should reject create user without admin role', async () => {
            const newUser = {
                name: 'New User',
                email: `newuser${Date.now()}@example.com`,
                password: 'newpass123',
                role: 'technician'
            };

            const res = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${token}`)
                .send(newUser);

            expect(res.status).toBe(403);
        });

        it('should create user when admin authenticated', async () => {
            const newUser = {
                name: 'New User',
                email: `newuser${Date.now()}@example.com`,
                password: 'newpass123',
                role: 'technician'
            };

            const res = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUser);

            expect(res.status).toBe(201);
            expect(res.body[0]).toHaveProperty('email', newUser.email);
        });

        it('should reject create user without token', async () => {
            const newUser = {
                name: 'Another User',
                email: `another${Date.now()}@example.com`,
                password: 'anotherpass123',
                role: 'customer'
            };

            const res = await request(app)
                .post('/api/users')
                .send(newUser);

            expect(res.status).toBe(401);
            expect(res.body.error).toContain('No token provided');
        });

        it('should update user when authenticated', async () => {
            const res = await request(app)
                .put(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Updated Name' });

            expect(res.status).toBe(200);
            expect(res.body[0]).toHaveProperty('name', 'Updated Name');
        });

        it('should reject update user without token', async () => {
            const res = await request(app)
                .put(`/api/users/${userId}`)
                .send({ name: 'Updated Name' });

            expect(res.status).toBe(401);
        });

        it('should delete user when authenticated', async () => {
            // First create a user to delete
            const newUser = {
                name: 'User to Delete',
                email: `delete${Date.now()}@example.com`,
                password: 'deletepass123',
                role: 'customer'
            };

            const createRes = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(newUser);

            expect(createRes.status).toBe(201);
            const userToDeleteId = createRes.body[0].id;

            // Now delete it
            const deleteRes = await request(app)
                .delete(`/api/users/${userToDeleteId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(deleteRes.status).toBe(204);
        });

        it('should reject delete user without token', async () => {
            const res = await request(app)
                .delete(`/api/users/${userId}`);

            expect(res.status).toBe(401);
        });
    });

    // Test password is never exposed
    describe('Password Security', () => {
        it('should not return password in user profile', async () => {
            const res = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${token}`);

            expect(res.body).not.toHaveProperty('password');
        });

        it('should not return password in getAllUsers', async () => {
            const res = await request(app)
                .get('/api/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body).toBeInstanceOf(Array);
            
            // Check none of the users have password field
            res.body.forEach(user => {
                expect(user).not.toHaveProperty('password');
            });
        });

        it('should not return password in getUserById', async () => {
            const res = await request(app)
                .get(`/api/users/${userId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.body).not.toHaveProperty('password');
        });

        it('should not return password in getTechnicians', async () => {
            const res = await request(app)
                .get('/api/users/technicians')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.body).toBeInstanceOf(Array);
            res.body.forEach(user => {
                expect(user).not.toHaveProperty('password');
            });
        });

        it('should not return password in getCustomers', async () => {
            const res = await request(app)
                .get('/api/users/customers')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.body).toBeInstanceOf(Array);
            res.body.forEach(user => {
                expect(user).not.toHaveProperty('password');
            });
        });
    });
});
