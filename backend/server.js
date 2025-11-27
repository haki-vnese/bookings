import express from 'express';
import servicesRouter from './src/routes/servicesRoutes.js';
import usersRouter from './src/routes/usersRoutes.js';
import technicianServicesRouter from './src/routes/technicianServicesRoutes.js';
import bookingRouter from './src/routes/bookingRoutes.js';
import availabilityRouter from './src/routes/availabilityRoutes.js';

const app = express();
app.use(express.json());

app.use('/api/services', servicesRouter);
app.use('/api/users', usersRouter);
app.use('/api/technician-services', technicianServicesRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);

app.listen(process.env.PORT, () => {
    console.log(`Server is running on port ${process.env.PORT}`);
}); 