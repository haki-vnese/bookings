# Testing Guide - Manual & Automated

## 🚀 Quick Test Scenarios

### Test 1: Complete Auth Flow (No Token Issues)

```bash
# Step 1: Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "role": "customer"
  }'

# Response: 201 Created
# {
#   "message": "User registered successfully",
#   "user": { "id": "...", "name": "John Doe", "email": "john@example.com", "role": "customer" },
#   "token": "eyJhbGciOiJIUzI1NiIs..."
# }

# Step 2: Save the token
TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Step 3: Get current user (protected route)
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# Response: 200 OK
# {
#   "id": "...",
#   "name": "John Doe",
#   "email": "john@example.com",
#   "role": "customer",
#   "created_at": "2026-01-25T..."
# }

# Step 4: Login again to get new token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'

# Response: 200 OK
# Same structure as register
```

### Test 2: Create Protected Resource (Booking)

```bash
# Using valid token from auth flow above
TOKEN="eyJhbGciOiJIUzI1NiIs..."

# Create a booking
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "technician_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "550e8400-e29b-41d4-a716-446655440001",
    "service_id": "550e8400-e29b-41d4-a716-446655440002",
    "start_time": "2026-01-26T10:00:00Z",
    "end_time": "2026-01-26T11:00:00Z",
    "note": "French manicure"
  }'

# Response: 201 Created
# [{ "id": "...", "technician_id": "...", ... }]

# Try WITHOUT token (should fail)
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "technician_id": "...",
    ...
  }'

# Response: 401 Unauthorized
# { "message": "No token provided" }
```

### Test 3: Password Not Exposed

```bash
# Get user info (should NOT have password field)
curl -X GET http://localhost:8000/api/users

# Response: 200 OK
# [
#   {
#     "id": "...",
#     "name": "John Doe",
#     "email": "john@example.com",
#     "role": "customer",
#     "created_at": "..."
#     // NO password field!
#   }
# ]

# Get technicians (should NOT have password field)
curl -X GET http://localhost:8000/api/users/technicians

# Response: 200 OK
# [
#   {
#     "id": "...",
#     "name": "Jane Smith",
#     "email": "jane@example.com",
#     "role": "technician",
#     "created_at": "..."
#     // NO password field!
#   }
# ]
```

### Test 4: Invalid Token

```bash
# Try with invalid token
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer invalid_token_123"

# Response: 401 Unauthorized
# { "message": "Invalid or expired token" }

# Try with malformed header
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: InvalidFormat"

# Response: 401 Unauthorized
# { "message": "No token provided" }
```

### Test 5: Validation Still Works

```bash
# Try to register with invalid data
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "email": "not-an-email",
    "password": "123",  // Too short
    "role": "admin"      // Invalid role
  }'

# Response: 400 Bad Request
# {
#   "message": "Validation failed: \"email\" must be a valid email; \"password\" must be at least 6 characters; \"role\" must be one of [technician, customer]"
# }
```

---

## 🧪 Automated Tests

### Running All Tests

```bash
cd backend
npm test
```

### Running Specific Test File

```bash
npm test -- tests/authFlow.test.js
```

### Running Specific Test Suite

```bash
npm test -- tests/authFlow.test.js -t "Authentication Flow"
```

### Running Specific Test

```bash
npm test -- tests/authFlow.test.js -t "should register a new user and return token"
```

### With Verbose Output

```bash
npm test -- --verbose
```

### Watch Mode (Run tests on file changes)

```bash
npm test -- --watch
```

---

## 📋 Test Categories in authFlow.test.js

### 1. Registration Tests (5 tests)
```javascript
POST /api/auth/register
├─ Valid registration → 201
├─ Duplicate email → 409
├─ Password too short → 400
├─ Invalid email → 400
└─ Invalid role → 400
```

### 2. Login Tests (3 tests)
```javascript
POST /api/auth/login
├─ Valid credentials → 200
├─ Wrong password → 401
└─ Non-existent email → 401
```

### 3. Protected Routes Tests (4 tests)
```javascript
GET /api/auth/me
├─ Valid token → 200
├─ No token → 401
├─ Invalid token → 401
└─ Malformed header → 401
```

### 4. Token Verification Tests (2 tests)
```javascript
POST /api/auth/verify
├─ Valid token → 200
└─ Invalid token → 401
```

### 5. Protected User Operations Tests (6 tests)
```javascript
POST /api/users (create)
├─ With token → 201
└─ Without token → 401

PUT /api/users/:id (update)
├─ With token → 200
└─ Without token → 401

DELETE /api/users/:id (delete)
├─ With token → 204
└─ Without token → 401
```

### 6. Password Security Tests (5 tests)
```javascript
Password never exposed in:
├─ GET /api/auth/me
├─ GET /api/users
├─ GET /api/users/:id
├─ GET /api/users/technicians
└─ GET /api/users/customers
```

---

## ✅ Expected Test Results

```
Test Suites: 3 passed, 3 total (errorHandler.test.js, validation.test.js, authFlow.test.js)
Tests:       55+ passed, 55+ total
Time:        5-10 seconds
```

---

## 🔍 Debugging Failed Tests

### Issue: Tests timeout
```bash
# Increase timeout
npm test -- --testTimeout=10000
```

### Issue: Database connection fails
```bash
# Check:
1. .env file has correct SUPABASE_URL and SUPABASE_ANON_KEY
2. Supabase project is accessible
3. users table has password column
4. Network connection is stable
```

### Issue: Token verification fails
```bash
# Check:
1. JWT_SECRET is set in .env
2. JWT_EXPIRY is valid (e.g., '7d', '24h')
3. Token was recently generated (not expired)
```

### Issue: Password exposure in tests
```bash
# This indicates a security issue. Check:
1. Controller SELECT queries exclude password
2. Response doesn't include password field
3. Supabase query is correct
```

---

## 📊 Test Coverage Areas

| Area | Tests | Status |
|------|-------|--------|
| Registration | 5 | ✅ Complete |
| Login | 3 | ✅ Complete |
| Token Verification | 2 | ✅ Complete |
| Protected Routes | 4 | ✅ Complete |
| User Operations | 6 | ✅ Complete |
| Password Security | 5 | ✅ Complete |
| Error Handling | 3 | ✅ Existing |
| Input Validation | 12 | ✅ Existing |
| **Total** | **40+** | ✅ Complete |

---

## 🛠️ Local Development Testing

### 1. Start Backend Server
```bash
cd backend
npm start
# Server runs on http://localhost:8000
```

### 2. Open Another Terminal & Run Tests
```bash
cd backend
npm test
```

### 3. Test Specific Feature
Use curl/Postman with examples from "Quick Test Scenarios" section above

### 4. Monitor Logs
```bash
# The server will log:
# - Request method, path, status
# - Validation errors
# - Auth failures
# - Database errors
```

---

## 🚨 Common Test Failures & Fixes

### "No token provided" on protected route
```
✓ This is CORRECT behavior - means your route IS protected
✓ Send Authorization header to fix: Bearer <token>
```

### "Invalid or expired token"
```
✓ Token might be malformed
✓ Token might be expired
✓ JWT_SECRET might be wrong
```

### "User not found"
```
✓ UUID might be wrong
✓ User was deleted
✓ Database is empty
```

### "Email already registered"
```
✓ User exists - try logging in instead
✓ Use different email for new registration
```

---

**Happy Testing!** 🎉
