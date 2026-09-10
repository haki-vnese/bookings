import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import addressesRouter from './src/routes/addressesRoutes.js';
import categoriesRouter from './src/routes/categoriesRoutes.js';
import companiesRouter from './src/routes/companiesRoutes.js';
import salonsRouter from './src/routes/salonsRoutes.js';
import staffRouter from './src/routes/staffRoutes.js';
import usersRouter from './src/routes/usersRoutes.js';
import meRouter from './src/routes/meRoutes.js';
import { requireAuthContext, requireAdminContext } from './src/middleware/authContext.js';
import { requireSalonHeader } from './src/middleware/salonContext.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';

const PORT = process.env.PORT || 3000;

const app = express();

// Middleware
app.use(cors({
  origin: [
    'https://booking.hairtasticheadspa.ca',
    'http://booking.hairtasticheadspa.ca'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-salon-id']
}));

app.use(express.json());

// Routes
// Addresses và Companies hiện chưa scope theo salon. Categories vẫn giữ
// middleware x-salon-id vì bảng đó đã phụ thuộc salon.
app.use('/api/me', requireAuthContext, meRouter);
app.use('/api/addresses', requireAuthContext, requireAdminContext, addressesRouter);
app.use('/api/categories', requireAuthContext, requireAdminContext, requireSalonHeader, categoriesRouter);
app.use('/api/companies', requireAuthContext, requireAdminContext, companiesRouter);
app.use('/api/staff', requireAuthContext, requireAdminContext, staffRouter);
app.use('/api/users', requireAuthContext, requireAdminContext, usersRouter);
app.use('/api/', requireAuthContext, requireAdminContext, salonsRouter);
// Error handling middleware
app.use(notFound);
app.use(errorHandler);

app.listen(PORT , () => {
    console.log(`Server is running on port ${PORT}`);
})
