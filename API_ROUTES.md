# API Routes Documentation

## Base URL
```
http://localhost:8000/api
```

---

## � Authentication

### POST /auth/register
Register a new user.
```
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "customer"
}
```
**Required Fields:**
- `name` (string, max 255)
- `email` (string, valid email format)
- `password` (string, min 6, max 128 characters)
- `role` (string, must be 'staff' or 'customer')

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "customer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### POST /auth/login
Login an existing user.
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}
```
**Required Fields:**
- `email` (string, valid email format)
- `password` (string)

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "customer"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### GET /auth/me
Get current authenticated user's profile.
```
GET /api/auth/me
Authorization: Bearer {token}
```
**Response (200):**
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "customer",
  "created_at": "2024-01-18T10:00:00Z"
}
```

### POST /auth/verify
Verify if a JWT token is valid.
```
POST /api/auth/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**Response (200):**
```json
{
  "valid": true,
  "user": {
    "userId": "uuid",
    "email": "john@example.com",
    "role": "customer"
  }
}
```

### POST /auth/logout
Logout (client removes token from localStorage).
```
POST /api/auth/logout
Authorization: Bearer {token}
```
**Response (200):**
```json
{
  "message": "Logout successful"
}
```

---

## �📋 Services

### GET /services
Fetch all services.
```
GET /api/services
```
**Response (200):**
```json
[
  {
    "id": "uuid",
    "name": "Manicure",
    "description": "Professional manicure service",
    "duration_minutes": 30,
    "price": 25.00,
    "created_at": "2024-01-18T10:00:00Z"
  }
]
```

### GET /services/:id
Fetch a specific service by ID.
```
GET /api/services/{id}
```
**Response (200):**
```json
{
  "id": "uuid",
  "name": "Manicure",
  "description": "Professional manicure service",
  "duration_minutes": 30,
  "price": 25.00
}
```

### POST /services
Create a new service.
```
POST /api/services
Content-Type: application/json

{
  "name": "Pedicure",
  "description": "Professional pedicure service",
  "duration_minutes": 45,
  "price": 35.00
}
```
**Required Fields:**
- `name` (string, max 255)
- `duration_minutes` (number, min 1)
- `price` (number, min 0)

**Optional Fields:**
- `description` (string, max 1000)

**Response (201):** Created service object

### PUT /services/:id
Update a service.
```
PUT /api/services/{id}
Content-Type: application/json

{
  "name": "Deluxe Pedicure",
  "price": 40.00
}
```
**Optional Fields:** Any service field (at least 1 required)

**Response (200):** Updated service object

### DELETE /services/:id
Delete a service.
```
DELETE /api/services/{id}
```
**Response (204):** No content

---

## 👥 Users

### GET /users
Fetch all users.
```
GET /api/users
```
**Response (200):**
```json
[
  {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "staff",
    "salon_id": "uuid",
    "created_at": "2024-01-18T10:00:00Z"
  }
]
```

### GET /users/:id
Fetch a specific user by ID.
```
GET /api/users/{id}
```
**Response (200):** User object

### GET /users/staff
Fetch all staff users.
```
GET /api/users/staff
```
**Response (200):** Array of staff user objects

### POST /users
Create a new system user (`superuser`, `admin`, or `staff`).
```
POST /api/users
Content-Type: application/json

{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "role": "staff",
  "salon_id": "uuid"
}
```
**Required Fields:**
- `name` (string, max 255)
- `email` (string, valid email format)
- `role` (string, one of `superuser`, `admin`, `staff`)

**Response (201):** Created user object

### PUT /users/:id
Update a user.
```
PUT /api/users/{id}
Content-Type: application/json

{
  "name": "Jane Johnson",
  "email": "jane.johnson@example.com"
}
```
**Optional Fields:** Any user field (at least 1 required)

**Response (200):** Updated user object

### DELETE /users/:id
Delete a user.
```
DELETE /api/users/{id}
```
**Response (204):** No content

---

## 🧾 Customers

### GET /customers
Fetch all customers.
```
GET /api/customers
```
**Response (200):** Array of customer objects

### GET /customers/:id
Fetch a specific customer by ID.
```
GET /api/customers/{id}
```
**Response (200):** Customer object

### POST /customers
Create a new customer.
```
POST /api/customers
Content-Type: application/json

{
  "name": "Customer Name",
  "email": "customer@example.com",
  "salon_id": "uuid"
}
```
**Required Fields:**
- `name` (string)
- `email` (string)
- `salon_id` (uuid for superuser requests; auto-scoped for admin)

### PUT /customers/:id
Update customer profile.
```
PUT /api/customers/{id}
```

### DELETE /customers/:id
Delete customer profile.
```
DELETE /api/customers/{id}
```

---

## 🛠️ Technician Services

### GET /technician-services
Fetch all technician services.
```
GET /api/technician-services
```
**Response (200):**
```json
[
  {
    "id": "uuid",
    "technician_id": "uuid",
    "service_id": "uuid",
    "price": 30.00,
    "created_at": "2024-01-18T10:00:00Z"
  }
]
```

### GET /technician-services/:id
Fetch a specific technician service by ID.
```
GET /api/technician-services/{id}
```
**Response (200):** Technician service object

### POST /technician-services
Create a technician-service relationship.
```
POST /api/technician-services
Content-Type: application/json

{
  "technician_id": "uuid",
  "service_id": "uuid",
  "price": 30.00
}
```
**Required Fields:**
- `technician_id` (UUID)
- `service_id` (UUID)

**Optional Fields:**
- `price` (number, min 0) - overrides default service price

**Response (201):** Created technician service object

### DELETE /technician-services/:id
Delete a technician-service relationship.
```
DELETE /api/technician-services/{id}
```
**Response (204):** No content

---

## 📅 Bookings

### GET /bookings
Fetch all bookings.
```
GET /api/bookings
```
**Response (200):** Array of booking objects

### GET /bookings/:id
Fetch a specific booking by ID.
```
GET /api/bookings/{id}
```
**Response (200):** Booking object

### GET /bookings/technician/:technicianId
Fetch all bookings for a specific technician.
```
GET /api/bookings/technician/{technicianId}
```
**Response (200):** Array of booking objects

### GET /bookings/customer/:customerId
Fetch all bookings for a specific customer.
```
GET /api/bookings/customer/{customerId}
```
**Response (200):** Array of booking objects

### POST /bookings
Create a new booking.
```
POST /api/bookings
Content-Type: application/json

{
  "technician_id": "uuid",
  "customer_id": "uuid",
  "service_id": "uuid",
  "start_time": "2024-01-20T10:00:00Z",
  "end_time": "2024-01-20T10:30:00Z",
  "note": "Customer preference: no aggressive filing"
}
```
**Required Fields:**
- `technician_id` (UUID)
- `customer_id` (UUID)
- `service_id` (UUID)
- `start_time` (ISO 8601 datetime)
- `end_time` (ISO 8601 datetime, must be after start_time)

**Optional Fields:**
- `note` (string)

**Response (201):**
```json
{
  "id": "uuid",
  "technician_id": "uuid",
  "customer_id": "uuid",
  "service_id": "uuid",
  "start_time": "2024-01-20T10:00:00Z",
  "end_time": "2024-01-20T10:30:00Z",
  "note": "Customer preference: no aggressive filing",
  "created_at": "2024-01-18T10:00:00Z"
}
```

### PUT /bookings/:id
Update a booking.
```
PUT /api/bookings/{id}
Content-Type: application/json

{
  "start_time": "2024-01-20T11:00:00Z",
  "end_time": "2024-01-20T11:30:00Z"
}
```
**Optional Fields:** Any booking field (at least 1 required)

**Response (200):** Updated booking object

### DELETE /bookings/:id
Delete a booking.
```
DELETE /api/bookings/{id}
```
**Response (204):** No content

---

## ⏰ Availability

### GET /availability/:technicianId
Fetch availability slots for a technician.
```
GET /api/availability/{technicianId}
```
**Query Parameters (optional):**
- `date` (YYYY-MM-DD) - Get availability for a specific date

**Response (200):**
```json
{
  "technician_id": "uuid",
  "available_slots": [
    {
      "start_time": "2024-01-20T10:00:00Z",
      "end_time": "2024-01-20T10:30:00Z",
      "duration_minutes": 30
    }
  ]
}
```

---

## ⚠️ Error Responses

All endpoints return standardized error responses:

### 400 Bad Request (Validation Error)
```json
{
  "error": {
    "statusCode": 400,
    "message": "Validation failed",
    "details": [
      {
        "field": "name",
        "message": "name is required"
      }
    ]
  }
}
```

### 404 Not Found
```json
{
  "error": {
    "statusCode": 404,
    "message": "Resource not found"
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "statusCode": 500,
    "message": "Internal server error"
  }
}
```

---

## Using Authentication

### 1. Register a new user
```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "password": "password123",
    "role": "technician"
  }'
```

### 2. Login
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "password123"
  }'
```
Copy the returned `token`.

### 3. Use token in protected routes
All routes that require authentication use the Authorization header:
```bash
curl -X GET http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 4. Protected Routes (require valid JWT token)
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - Logout (optional, token just removed on client)

### 5. Optional: Protect other routes
You can protect any route by adding the `verifyAuth` middleware:
```javascript
import { verifyAuth, authorize } from '../middleware/auth.js';

// Protect a route
router.delete('/:id', verifyAuth, catchAsync(deleteUser));

// Protect with role check
router.get('/admin/dashboard', verifyAuth, authorize('admin'), handler);
```

---

## Testing with cURL

**Get all services:**
```bash
curl -X GET http://localhost:8000/api/services
```

**Create a service:**
```bash
curl -X POST http://localhost:8000/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nail Art",
    "description": "Custom nail art design",
    "duration_minutes": 60,
    "price": 50.00
  }'
```

**Get bookings for a customer:**
```bash
curl -X GET http://localhost:8000/api/bookings/customer/{customerId}
```

---

## Access Control Notes (Updated)

- Services: `POST/PUT/DELETE /api/services` require admin. Reads are public.
- Users: all `/api/users` endpoints require `admin` or `superuser`.
- Customers: all `/api/customers` endpoints require `admin` or `superuser`.
- Technician services: all `/api/technician-services` endpoints require `admin` or `superuser`.
- Bookings:
  - `GET /api/bookings` admin only.
  - `GET /api/bookings/:id` admin or owning customer or assigned technician.
  - `GET /api/bookings/technician/:technicianId` admin or that technician.
  - `GET /api/bookings/customer/:customerId` admin or that customer.
  - `POST /api/bookings` admin or owning customer (customer_id must match token).
  - `PUT/DELETE /api/bookings/:id` admin or owning customer.
  - Tenant scope: `admin` can only access bookings in their own `salon_id`; `superuser` can access all salons.

---

## Webhook Integration (WordPress/Forminator)

### Endpoint
- `POST /webhooks/forminator`

### Security
- Set `FORMINATOR_WEBHOOK_TOKEN` in backend env.
- Send webhook token in one of these:
  - Query: `?token=...`
  - Header: `x-webhook-token: ...` (recommended)
  - Header: `x-forminator-token: ...`

### Payload Fields (minimum)
- Service selection: one of `service_id`, `service`, `service_name`, `select_1`.
- Technician selection: one of `technician_id`, `technician`, `technician_name`, `select_2`.
- Date: one of `date_1`, `appointment_date`, `date`.
- Customer identity: `customer_id` or customer email (`email_1`, `email`).

### Optional multi-salon fields
- `salon_id`, `salonId`, `location_id`, `location`, `branch`.
- If missing, backend falls back to `FORMINATOR_DEFAULT_SALON_ID`.

### Idempotency behavior
- Duplicate webhook retries are ignored by default when booking segments match:
  - `technician_id`, `customer_id`, `service_id`, `start_time`, `end_time`
- Disable dedupe only if needed: `FORMINATOR_DEDUPLICATE=false`

### Recommended env vars for WordPress integration
```
FORMINATOR_WEBHOOK_TOKEN=your_secure_token
FORMINATOR_DEFAULT_SALON_ID=<salon-uuid>
FORMINATOR_SALON_MAP={"downtown":"<salon-uuid>","uptown":"<salon-uuid>"}
FORMINATOR_SERVICE_MAP={"gel manicure":"<service-uuid>"}
FORMINATOR_TECHNICIAN_MAP={"anna":"<staff-uuid>"}
FORMINATOR_DEDUPLICATE=true
```

---

## Environment Setup

Make sure your `.env` file has:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
PORT=8000
```
