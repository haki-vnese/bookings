export function renderOverviewPanel(state) {
  return `
    <section class="nd-grid">
      <article class="nd-card"><h3>Bookings</h3><p>${state.metrics.bookings}</p></article>
      <article class="nd-card"><h3>Customers</h3><p>${state.metrics.customers}</p></article>
      <article class="nd-card"><h3>Staff</h3><p>${state.metrics.staff}</p></article>
      <article class="nd-card"><h3>Services</h3><p>${state.metrics.services}</p></article>
    </section>
    <section class="nd-panel">
      <h3>Next Steps</h3>
      <ul>
        <li>Connect booking calendar UI to <code>GET /api/bookings</code>.</li>
        <li>Enhance current users/customers create flows with edit drawers.</li>
        <li>Add webhook diagnostics under Integration module.</li>
      </ul>
    </section>
  `;
}
