import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';

import categoriesRouter from './src/routes/categoriesRoutes.js';
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
app.use('/api/categories', requireSalonHeader, categoriesRouter);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

app.listen(PORT , () => {
    console.log(`Server is running on port ${PORT}`);
})
