# Backend Architecture

> Nail Salon Booking System — Express 5 + Supabase

## High-Level Overview

```
┌─────────────────────────────────────────────────────────┐
│  WordPress (Forminator)                                 │
│  ──────────────────────                                 │
│  Submits booking forms → POST /webhooks/forminator      │
└──────────────┬──────────────────────────────────────────┘
               │ (token-gated, fire-and-forget)
               ▼
┌─────────────────────────────────────────────────────────┐
│               Express Server  (server.js)               │
│  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐  │
│  │  CORS    │→│  JSON    │→│  Request   │→│  Routes  │  │
│  │          │ │  parser  │ │  Logger    │ │          │  │
│  └──────────┘ └──────────┘ └────────────┘ └────┬─────┘  │
│                                                │        │
│       ┌────────────────────────────────────────┘        │
│       ▼                                                 │
│  ┌──────────────────────────────────────┐               │
│  │  Route files  (src/routes/*.js)      │               │
│  │  ─────────────────────────────       │               │
│  │  verifyAuth → authorize → validate   │               │
│  │  → catchAsync(controller)            │               │
│  └────────────────┬─────────────────────┘               │
│                   ▼                                     │
│  ┌──────────────────────────────────────┐               │
│  │  Controllers  (src/controllers/*.js) │               │
│  │  ───────────────────────────────     │               │
│  │  Business logic + role checks        │               │
│  │  Imports shared utils for roles,     │               │
│  │  tenant scoping, enrichment          │               │
│  └────────────────┬─────────────────────┘               │
│                   ▼                                     │
│  ┌──────────────────────────────────────┐               │
│  │  Services  (src/services/*.js)       │               │
│  │  ─────────────────────────────       │               │
│  │  Complex business logic extracted    │               │
│  │  from routes (webhook processing)    │               │
│  └────────────────┬─────────────────────┘               │
│                   ▼                                     │
│  ┌──────────────────────────────────────┐               │
│  │  Supabase Client  (src/db/supabase)  │               │
│  │  PostgREST queries via JS SDK        │               │
│  └──────────────┬───────────────────────┘               │
│                 │                                       │
│  ┌──────────────┴───────────────────────┐               │
│  │  Error Handler (middleware)          │               │
│  │  Catches all thrown ApiErrors +      │               │
│  │  unhandled rejections via catchAsync │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase (PostgreSQL)                                  │
│  ─────────────────────                                  │
│  Tables: users, staff, customers, bookings, services,   │
│          technician_services, companies, salons          │
└─────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
backend/
├── server.js                    # App entry — bootstraps Express, mounts routes
├── package.json
├── src/
│   ├── controllers/
│   │   ├── authController.js          # Register, login, verify, logout
│   │   ├── availabilityController.js  # Computes open time slots
│   │   ├── bookingsController.js      # Booking CRUD with tenant isolation
│   │   ├── companiesController.js     # Company CRUD (superuser-only writes)
│   │   ├── customersController.js     # Customer CRUD (tenant-scoped)
│   │   ├── salonsController.js        # Salon read-only list
│   │   ├── servicesController.js      # Global service catalogue CRUD
│   │   ├── staffController.js         # Staff profile CRUD
│   │   ├── technicianServicesController.js  # Service ↔ technician assignments
│   │   ├── usersController.js         # User account CRUD + staff sync
│   │   └── webhookController.js       # Thin HTTP layer for webhooks
│   ├── db/
│   │   └── supabase.js                # Singleton Supabase client
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification + role authorization
│   │   ├── errorHandler.js            # Centralised error response formatting
│   │   ├── requestLogger.js           # Per-request timing logs
│   │   └── validate.js                # Joi schema validation middleware
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── availabilityRoutes.js
│   │   ├── bookingRoutes.js
│   │   ├── companiesRoutes.js
│   │   ├── customersRoutes.js
│   │   ├── salonsRoutes.js
│   │   ├── servicesRoutes.js
│   │   ├── staffRoutes.js
│   │   ├── technicianServicesRoutes.js
│   │   ├── usersRoutes.js
│   │   └── webhooksRoutes.js
│   ├── services/
│   │   └── webhookService.js          # Forminator webhook business logic
│   ├── utils/
│   │   ├── ApiError.js                # Custom HTTP error class
│   │   ├── catchAsync.js              # Async route handler wrapper
│   │   ├── enrichment.js              # Shared data enrichment (salon names)
│   │   ├── roles.js                   # Role predicates + admin scope check
│   │   └── tenantScope.js             # Tenant relationship helpers
│   └── validation/
│       └── schemas.js                 # Joi schemas for all writable endpoints
└── tests/
    ├── authFlow.test.js
    ├── availability.test.js
    ├── errorHandler.test.js
    └── validation.test.js
```

---

## Tenant Model

```
Company  ──1:N──  Salon  ──1:N──  Staff / Customer / User
```

- **Company** — top-level organisation (e.g. "Van Hair Tastic").
- **Salon** — physical location belonging to a company.
- **Users** — authentication accounts; each user has `role`, `company_id`, `salon_id`.
- **Staff** — scheduling entity linked to a user via `user_id`.  Created automatically when a staff-role user is saved.
- **Customer** — belongs to a salon.

### Role Hierarchy

| Role        | Scope                                     |
|-------------|-------------------------------------------|
| `superuser` | Unrestricted — sees/modifies everything   |
| `admin`     | Scoped to own `company_id` and/or `salon_id` |
| `staff`     | Own records only (bookings, profile)      |
| `customer`  | Own bookings only                         |

Key design decision: `isAdmin(req)` is **strictly** admin — it does NOT include superuser.  Use `isAdminOrAbove(req)` when the intent is "admin or superuser".

---

## Request Lifecycle

```
HTTP Request
  │
  ├─ express.json()          Parse body
  ├─ CORS                    Origin filter
  ├─ requestLogger           Start timer, log on response finish
  │
  ├─ Route matched?
  │   ├─ YES
  │   │   ├─ verifyAuth      Decode + verify JWT → req.user
  │   │   ├─ authorize(...)  Check req.user.role ∈ allowed set
  │   │   ├─ validate(schema) Joi validation of req.body
  │   │   └─ controller fn   Business logic → Supabase query → res.json()
  │   │       └─ (errors)    Thrown ApiError or unhandled → catchAsync → next(err)
  │   │
  │   └─ NO → notFound       404 JSON
  │
  └─ errorHandler            Format error response, log stack trace
```

### Middleware Order (per protected route)

```
verifyAuth → authorize → validate → catchAsync(controller)
```

`verifyAuth` runs **before** `validate` so unauthenticated requests receive 401, not a validation error.

---

## Authentication Flow

### Registration (`POST /api/auth/register`)

1. Joi validates body (name, email, password, role, etc.).
2. Optional privileged-registration gate: if `REQUIRE_ADMIN_TOKEN_FOR_PRIVILEGED_REGISTER=true`, creating admin/staff/superuser roles requires a valid admin/superuser JWT in the `Authorization` header.
3. Check email + username uniqueness.
4. Hash password with bcrypt (cost 10).
5. Insert user row.
6. Return JWT + user object.

### Login (`POST /api/auth/login`)

1. Joi validates body (identifier + password).
2. Look up user by email (case-insensitive); if not found, try username.
3. Only bcrypt-hashed passwords are accepted.  Legacy plain-text rows always fail — affected users must reset via admin.
4. On success, return JWT with `{ userId, email, role, company_id, salon_id }`.

### Token Verification (`POST /api/auth/verify`)

Accepts a JWT from the body or `Authorization` header and returns `{ valid, user }`.

---

## Shared Utilities

### `roles.js` — Role Predicates

| Function | Returns true when |
|---|---|
| `isSuperuser(req)` | `req.user.role === 'superuser'` |
| `isAdmin(req)` | `req.user.role === 'admin'` (strict) |
| `isAdminOrAbove(req)` | admin OR superuser |
| `isStaff(req)` | `req.user.role === 'staff'` |
| `isCustomer(req)` | `req.user.role === 'customer'` |
| `ensureAdminScope(req)` | Throws 403 if admin lacks both `company_id` and `salon_id` |

### `tenantScope.js` — Tenant Helpers

| Function | Purpose |
|---|---|
| `resolveCompanyIdFromSalon(salonId)` | Looks up the owning company for a salon |
| `ensureSalonBelongsToCompany(salonId, companyId)` | Throws 400 if the salon is in a different company |

### `enrichment.js` — Response Enrichment

| Function | Purpose |
|---|---|
| `withSalonName(rows)` | Batch-loads salon names and adds `salon_name` to each row |

---

## Webhook Integration

External booking sources (WordPress Forminator forms) send `POST /webhooks/forminator`.

### Pipeline

```
Incoming HTTP POST
  │
  ├─ Token check (header or query string vs FORMINATOR_WEBHOOK_TOKEN)
  ├─ Respond 200 immediately (fire-and-forget)
  │
  └─ Background processing:
      ├─ normalizePayload()         Flatten nested shapes
      ├─ collectSelectionCandidates() Gather value candidates per field
      ├─ resolveSalonId()           UUID → name → partial match → default
      ├─ resolveCustomer()          UUID → email → create new
      ├─ resolveServices()          Per-candidate resolution with fallback
      ├─ resolveTechnician()        UUID → email/name match
      ├─ toIsoStartTime()           Date + time → ISO string
      └─ insertBookingWithNotesFallback()  Column-name fallback + dedup
```

### Environment Variables

| Variable | Purpose |
|---|---|
| `FORMINATOR_WEBHOOK_TOKEN` | Shared secret for webhook auth |
| `FORMINATOR_DEFAULT_SALON_ID` | Fallback salon UUID |
| `FORMINATOR_TIMEZONE` | Timezone for date parsing (default: UTC) |
| `FORMINATOR_DEDUPLICATE` | `"true"` (default) or `"false"` |
| `FORMINATOR_SALON_MAP` | JSON map: `{"form-value":"salon-uuid"}` |
| `FORMINATOR_SERVICE_MAP` | JSON map: `{"form-value":"service-uuid"}` |
| `FORMINATOR_TECHNICIAN_MAP` | JSON map: `{"form-value":"technician-uuid"}` |

---

## Error Handling Strategy

1. **`catchAsync`** wraps every async route handler so rejected promises are forwarded to `next(err)`.
2. **`ApiError`** is the custom error class — holds `status` and `expose` flag.
3. **`errorHandler`** middleware:
   - Logs the full stack trace server-side.
   - Sends `err.message` to the client only if `err.expose === true`.
   - 500 errors always get a generic "Internal Server Error" message.

---

## Environment Variables (Required)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous API key |
| `JWT_SECRET` | Secret key for signing JWTs |
| `JWT_EXPIRY` | Token expiry duration (e.g. `"24h"`) |
| `PORT` | Server port (e.g. `3000`) |

### Optional

| Variable | Description |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated CORS origins (defaults to `*`) |
| `DASHBOARD_ENTRY_URL` | Redirect target for `GET /` |
| `REQUIRE_ADMIN_TOKEN_FOR_PRIVILEGED_REGISTER` | `"true"` to gate privileged registration |
| `FORMINATOR_*` | See Webhook Integration section above |
