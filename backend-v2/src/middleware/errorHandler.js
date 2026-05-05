/* Một nơi duy nhất quyết định:

trả status nào
trả message nào
log gì ở server 

*/

import ApiError from '../utils/ApiError.js';

// src/middleware/errorHandler.js
export const notFound = (req, res, next) => {
  res.status(404).json({ error: 'Route not found' });
};

export const errorHandler = (err, req, res, next) => { 
    const statusCode = err.status || 500;
    const message = err.message || 'Internal Server Error';

    if (statusCode >= 500) {
        console.error('[ERROR]', err); // Log lỗi server để debug
    }

    res.status(statusCode).json({ error: message })
};