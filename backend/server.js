import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import authRouter from './src/routes/authRoutes.js';
import servicesRouter from './src/routes/servicesRoutes.js';
import usersRouter from './src/routes/usersRoutes.js';
import technicianServicesRouter from './src/routes/technicianServicesRoutes.js';
import bookingRouter from './src/routes/bookingRoutes.js';
import availabilityRouter from './src/routes/availabilityRoutes.js';
import requestLogger from './src/middleware/requestLogger.js';
import webhookRouter from './src/routes/webhooksRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorHandler.js';

const app = express();
app.use(express.json());
app.use(cors({
    origin: '*',
})
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// request logging (lightweight)
app.use(requestLogger);
app.use('/api/auth', authRouter);
app.use('/api/services', servicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/technician-services', technicianServicesRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);
app.use('/webhooks', webhookRouter); // add this before notFound
app.post('/webhooks/forminator', (req, res) => {
  console.log('Webhook hit:', req.headers['content-type'], req.body);
  return res.status(200).json({ ok: true });
});

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