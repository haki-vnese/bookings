export function renderIntegrationPanel() {
  return `
    <section class="nd-panel">
      <h3>WordPress Webhook Integration</h3>
      <ul>
        <li>Webhook endpoint: <code>/webhooks/forminator</code></li>
        <li>Preferred auth header: <code>x-webhook-token</code></li>
        <li>Multi-salon support: <code>FORMINATOR_SALON_MAP</code></li>
        <li>Dedupe retries: <code>FORMINATOR_DEDUPLICATE=true</code></li>
      </ul>
      <p class="nd-muted">Use <code>WORDPRESS_WEBHOOK_SETUP.md</code> for full payload mapping and test command.</p>
    </section>
  `;
}
