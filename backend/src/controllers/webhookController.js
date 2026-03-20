/**
 * Webhook controller — thin HTTP layer for Forminator form webhooks.
 *
 * Validates the token, responds 200 immediately (fire-and-forget),
 * then delegates the heavy lifting to webhookService.
 */

import { getWebhookToken, processForminatorPayload } from '../services/webhookService.js';

/**
 * POST /webhooks/forminator
 *
 * Authenticates via `FORMINATOR_WEBHOOK_TOKEN` env var (header or query).
 * Returns 200 right away; booking creation runs in the background so
 * the caller (WordPress) isn't blocked.
 */
export function handleForminator(req, res) {
  const expected = process.env.FORMINATOR_WEBHOOK_TOKEN;
  const providedToken = getWebhookToken(req);

  if (expected && providedToken !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({ ok: true });

  processForminatorPayload(req.body).catch((err) => {
    console.error('Forminator webhook processing error:', err);
  });
}
