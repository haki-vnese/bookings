# Authentication Setup Guide

## ✅ What's Implemented

You now have a complete JWT-based authentication system:

### New Files Created
- `src/controllers/authController.js` - Register, login, verify token
- `src/routes/authRoutes.js` - Auth endpoints
- `src/middleware/auth.js` - JWT verification & role-based access control

### New Packages
- `jsonwebtoken` - JWT token generation and verification
- `bcryptjs` - Password hashing

### New Endpoints
- `POST /api/auth/register` - Create new user with password
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile (requires token)
- `POST /api/auth/verify` - Verify token validity
- `POST /api/auth/logout` - Logout (client-side token removal)

---

## ⚠️ Database Migration Required

You need to add a `password` column to your Supabase `users` table:

### Option 1: Using Supabase Dashboard (Easiest)
1. Go to Supabase Dashboard → Tables
2. Select the `users` table
3. Click "Add column" button
4. Column name: `password`
5. Column type: `text`
6. Make it **NOT NULL** (required)
7. Click "Save"

### Option 2: Using SQL (in Supabase SQL Editor)
```sql
ALTER TABLE public.users
ADD COLUMN password TEXT NOT NULL;
```

---

## 🔐 Environment Variables

Your `.env` file now has:
```
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRY=7d
```

**Important:** Before deploying to production:
1. Change `JWT_SECRET` to a strong random string (32+ characters)
2. Use a secret management tool (AWS Secrets Manager, Render Secrets, etc.)

Generate a strong secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 🧪 Testing Auth Endpoints

### Register a user
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "customer"
  }'
```

### Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Get current user (requires token from login)
```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🛡️ Using Auth in Your Frontend

### JavaScript/React Example
```javascript
// Register
const response = await fetch('http://localhost:8000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    password: 'password123',
    role: 'customer'
  })
});

const data = await response.json();
localStorage.setItem('token', data.token);

// Login
const loginResponse = await fetch('http://localhost:8000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@example.com',
    password: 'password123'
  })
});

const loginData = await loginResponse.json();
localStorage.setItem('token', loginData.token);

// Use token in protected routes
const meResponse = await fetch('http://localhost:8000/api/auth/me', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});

const userData = await meResponse.json();
console.log('Current user:', userData);
```

---

## 🔒 Protecting Routes

To protect routes that require authentication, use the `verifyAuth` middleware:

```javascript
import { verifyAuth, authorize } from '../middleware/auth.js';

// Protect a route (any authenticated user)
router.delete('/:id', verifyAuth, catchAsync(deleteUser));

// Protect with role requirement
router.get('/admin', verifyAuth, authorize('admin'), catchAsync(getAdmin));

// Multiple roles
router.get('/staff', verifyAuth, authorize('admin', 'technician'), catchAsync(getStaff));
```

---

## ✨ Next Steps

1. **Update your Supabase schema** - Add password column to users table
2. **Test auth endpoints** - Use the cURL commands above
3. **Update user registration** - Old user creation endpoint still works but should use auth/register
4. **Add token storage** - Store JWT in localStorage on frontend
5. **Protect routes** - Add `verifyAuth` middleware to routes that need authentication
6. **Handle token refresh** - Consider adding token refresh logic for better UX
