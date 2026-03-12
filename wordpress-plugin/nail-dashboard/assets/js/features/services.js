export function renderServicesPanel(state, helpers) {
  const { esc } = helpers;
  const rows = state.data.services;

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Services</h3>
        <button class="nd-ghost" data-action="refresh-data">Refresh</button>
      </div>
      <div class="nd-table-wrap">
        <table class="nd-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Duration</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map(
                      (row) => `
                <tr>
                  <td>${esc(row.name)}</td>
                  <td>${esc(row.duration_minutes)} min</td>
                  <td>${esc(row.price)}</td>
                </tr>
              `
                    )
                    .join('')
                : '<tr><td colspan="3" class="nd-empty">No services found.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      <p class="nd-muted">Technician-service assignment UI is planned for the next slice.</p>
    </section>
  `;
}

export function bindServicesEvents(ctx) {
  const { app, refreshData, render } = ctx;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });
}
