# API Reference

> Base URL: `https://bookings-3mtq.onrender.com` (production)

All endpoints return JSON. Errors follow the shape `{ "error": "message" }`.

---

## Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None¹ | Create a new account |
| POST | `/api/auth/login` | None | Log in, receive JWT |
| POST | `/api/auth/verify` | None | Validate a JWT |
| GET | `/api/auth/me` | JWT | Get current user profile |
| POST | `/api/auth/logout` | JWT | Logout (client-side) |

¹ Privileged roles may require admin JWT when `REQUIRE_ADMIN_TOKEN_FOR_PRIVILEGED_REGISTER=true`.

### POST `/api/auth/register`

```json
{
  "name": "string (required)",
  "email": "string, valid email (required)",
  "username": "string, alphanumeric, 3-50 chars (optional)",
  "password": "string, 6-128 chars (required)",
  "role": "admin | staff | customer (required)",
  "company_id": "UUID (optional)",
  "salon_id": "UUID (optional, required for staff)"
}
```

**Response** `201`:
```json
{
  "message": "User registered successfully",
  "user": { "id", "name", "email", "username", "role", "company_id", "salon_id" },
  "token": "JWT string"
}
```

### POST `/api/auth/login`

```json
{
  "identifier": "email or username (required, or use 'email' key)",
  "password": "string (required)"
}
```

**Response** `200`:
```json
{
  "message": "Login successful",
  "user": { "id", "name", "email", "username", "role", "company_id", "salon_id" },
  "token": "JWT string"
}
```

---

## Users

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/users` | JWT | admin, superuser |
| GET | `/api/users/staff` | JWT | admin, superuser |
| GET | `/api/users/:id` | JWT | admin, superuser |
| POST | `/api/users` | JWT | admin, superuser |
| PUT | `/api/users/:id` | JWT | admin, superuser |
| PUT | `/api/users/me` | JWT | any |
| DELETE | `/api/users/:id` | JWT | admin, superuser |

### POST `/api/users`

```json
{
  "name": "string (required)",
  "email": "valid email (required)",
  "username": "alphanumeric, 3-50 (optional)",
  "password": "string, 6-128 (required)",
  "role": "superuser | admin | staff (required)",
  "company_id": "UUID (optional)",
  "salon_id": "UUID (required for staff)"
}
```

Notes:
- Admins cannot create superusers (403).
- Admin-created users inherit the admin's `company_id` and `salon_id`.
- Creating a staff user auto-creates a matching row in the `staff` table.

---

## Customers

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/customers` | JWT | admin, superuser |
| GET | `/api/customers/:id` | JWT | admin, superuser |
| POST | `/api/customers` | JWT | admin, superuser |
| PUT | `/api/customers/:id` | JWT | admin, superuser |
| DELETE | `/api/customers/:id` | JWT | admin, superuser |

### POST `/api/customers`

```json
{
  "name": "string (required)",
  "email": "valid email (required)",
  "phone": "string (optional)",
  "salon_id": "UUID (required)"
}
```

---

## Staff

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/staff/me` | JWT | staff |
| GET | `/api/staff` | JWT | admin, superuser |
| GET | `/api/staff/:id` | JWT | admin, superuser |
| POST | `/api/staff` | JWT | admin, superuser |
| PUT | `/api/staff/:id` | JWT | admin, superuser |
| DELETE | `/api/staff/:id` | JWT | admin, superuser |

### POST `/api/staff`

```json
{
  "name": "string (required)",
  "phone": "string (optional)",
  "email": "email (optional)",
  "address_id": "UUID (optional)",
  "company_id": "UUID (required)",
  "salon_id": "UUID (required)",
  "user_id": "UUID (optional — links to a user account)"
}
```

---

## Companies

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/companies` | JWT | admin, superuser |
| GET | `/api/companies/:id` | JWT | admin, superuser |
| POST | `/api/companies` | JWT | superuser |
| PUT | `/api/companies/:id` | JWT | superuser |
| DELETE | `/api/companies/:id` | JWT | superuser |

### POST `/api/companies`

```json
{
  "name": "string (required)",
  "address_id": "UUID (optional)"
}
```

---

## Salons

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/salons` | JWT | admin, superuser |

---

## Services

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/services` | None | public |
| GET | `/api/services/:id` | None | public |
| POST | `/api/services` | JWT | admin, superuser |
| PUT | `/api/services/:id` | JWT | admin, superuser |
| DELETE | `/api/services/:id` | JWT | admin, superuser |

### POST `/api/services`

```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "duration_minutes": "integer >= 1 (required)",
  "price": "number >= 0 (required)"
}
```

---

## Technician Services

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/technician-services` | JWT | admin, superuser |
| GET | `/api/technician-services/:id` | JWT | admin, superuser |
| POST | `/api/technician-services` | JWT | admin, superuser |
| DELETE | `/api/technician-services/:id` | JWT | admin, superuser |

### POST `/api/technician-services`

```json
{
  "technician_id": "UUID (required)",
  "service_id": "UUID (required)",
  "price": "number (optional — overrides service price)"
}
```

---

## Bookings

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/bookings` | JWT | admin, superuser |
| GET | `/api/bookings/:id` | JWT | any (ownership checked) |
| GET | `/api/bookings/technician/:technicianId` | JWT | admin, staff (own) |
| GET | `/api/bookings/customer/:customerId` | JWT | admin, customer (own) |
| POST | `/api/bookings` | JWT | any (ownership checked) |
| PUT | `/api/bookings/:id` | JWT | any (ownership checked) |
| DELETE | `/api/bookings/:id` | JWT | admin, customer (own) |

### POST `/api/bookings`

```json
{
  "technician_id": "UUID (required)",
  "customer_id": "UUID (required)",
  "service_id": "UUID (required)",
  "start_time": "ISO datetime (required)",
  "end_time": "ISO datetime (required, must be after start_time)",
  "note": "string (optional)"
}
```

---

## Availability

| Method | Path | Auth | Roles |
|--------|------|------|-------|
| GET | `/api/availability/:technicianId` | JWT | any |

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `date` | `YYYY-MM-DD` | Yes | Day to check |
| `serviceId` | UUID | Yes | Service (determines slot duration) |

**Response** `200`:
```json
{
  "availableSlots": [
    { "start": "09:00", "end": "10:00" },
    { "start": "10:00", "end": "11:00" }
  ]
}
```

---

## Webhooks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/forminator` | Token | Process Forminator form submission |

Authentication is via `x-webhook-token` header, `x-forminator-token` header, or `?token=` query parameter, matched against `FORMINATOR_WEBHOOK_TOKEN` env var.

See [ARCHITECTURE.md](ARCHITECTURE.md#webhook-integration) for full webhook pipeline details.

---

## Error Responses

All errors return:
```json
{ "error": "Human-readable message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Validation error or bad request |
| 401 | Missing or invalid token |
| 403 | Insufficient permissions |
| 404 | Resource not found |
| 409 | Conflict (duplicate email/username) |
| 500 | Internal server error (details hidden) |
