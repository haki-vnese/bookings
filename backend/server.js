/**
 * Application entry point.
 *
 * Bootstraps the Express server, mounts all route trees, and wires
 * global middleware (CORS, JSON parsing, request logging, error
 * handling).  Exits immediately when required environment variables
 * are missing to avoid masked failures at runtime.
 *
 * Route prefix convention:
 *   /api/*       — authenticated REST endpoints
 *   /webhooks/*  — unauthenticated inbound webhooks (token-gated)
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRouter from './src/routes/authRoutes.js';
import servicesRouter from './src/routes/servicesRoutes.js';
import usersRouter from './src/routes/usersRoutes.js';
import customersRouter from './src/routes/customersRoutes.js';
import technicianServicesRouter from './src/routes/technicianServicesRoutes.js';
import bookingRouter from './src/routes/bookingRoutes.js';
import availabilityRouter from './src/routes/availabilityRoutes.js';
import requestLogger from './src/middleware/requestLogger.js';
import webhookRouter from './src/routes/webhooksRoutes.js';
import companiesRouter from './src/routes/companiesRoutes.js';
import staffRouter from './src/routes/staffRoutes.js';
import salonsRouter from './src/routes/salonsRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';

// ── Fail-fast: verify critical environment variables at startup ─────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Required environment variable ${key} is not set.`);
    process.exit(1);
  }
}

// ── CORS: restrict origins in production, allow all in dev/test ─────────
const corsOrigin = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : '*';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: corsOrigin }));

// Basic probe endpoints to reduce noisy 404s when opening backend URL in browser.
app.get('/', (req, res) => {
    const entryUrl = process.env.DASHBOARD_ENTRY_URL;
    if (entryUrl) {
        return res.redirect(302, entryUrl);
    }

    res.status(200).json({
        status: 'ok',
        service: 'nail-salon-booking-api',
        hint: 'https://booking.hairtasticheadspa.ca/dashboard/'
    });
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});

// ── Middleware pipeline ──────────────────────────────────────────────────
// Request logger runs first so every request (including errors) is logged.
app.use(requestLogger);

// ── Route mounting ──────────────────────────────────────────────────────
// Auth endpoints are public (register, login) + protected (me, logout).
app.use('/api/auth', authRouter);
// Resource endpoints — each route file handles its own auth gates.
app.use('/api/services', servicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/salons', salonsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/technician-services', technicianServicesRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);
// Webhook routes sit outside /api/* — they are token-gated, not JWT-gated.
app.use('/webhooks', webhookRouter);

// 404 handler
app.use(notFound);

// centralized error handler
app.use(errorHandler);


if (process.env.NODE_ENV !== 'test') {
    app.listen(process.env.PORT, () => {
        console.log(`Server is running on port ${process.env.PORT}`);
    });
}

export default app;