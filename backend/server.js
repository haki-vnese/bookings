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

const app = express();
app.use(express.json());
app.use(cors({
    origin: '*',
})
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// request logging (lightweight)
app.use(requestLogger);
app.use('/api/auth', authRouter);
app.use('/api/services', servicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/salons', salonsRouter);
app.use('/api/staff', staffRouter);
app.use('/api/technician-services', technicianServicesRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);
app.use('/webhooks', webhookRouter); // add this before notFound

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