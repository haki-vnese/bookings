/**
 * Webhook routes — wires HTTP endpoints to the webhook controller.
 *
 * POST /webhooks/forminator  →  handleForminator
 */

import express from 'express';
import { handleForminator } from '../controllers/webhookController.js';

const router = express.Router();

router.post('/forminator', handleForminator);

export default router;
