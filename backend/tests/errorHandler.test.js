import request from 'supertest';
import app from '../server.js';
import { jest } from '@jest/globals';

describe('error handler / debug routes', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('debug throw -> returns sanitized 500 and logs stack', async () => {
    const res = await request(app).get('/api/services/debug/throw');
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Internal Server Error');
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('debug expose -> returns exposed 400 message', async () => {
    const res = await request(app).get('/api/services/debug/expose');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'exposed message');
    // errorHandler still logs the stack (we show it server-side)
    expect(consoleSpy).toHaveBeenCalled();
  });

  test('unknown route -> 404 Not Found', async () => {
    const res = await request(app).get('/api/services/non/existent/route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'Not Found');
    // 404 doesn't hit errorHandler, so console.error should not be called
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
