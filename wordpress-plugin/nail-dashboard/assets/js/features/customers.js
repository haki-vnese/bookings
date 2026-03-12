export function renderCustomersPanel(state, helpers) {
  const { canManage, esc } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const rows = state.data.customers;
  const canCreate = canManage(role);

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Customers</h3>
        <button class="nd-ghost" data-action="refresh-data">Refresh</button>
      </div>
      ${
        canCreate
          ? `
            <form id="nd-customer-form" class="nd-inline-form">
              <input name="name" required placeholder="Customer name" />
              <input name="email" type="email" required placeholder="customer@email.com" />
              ${
                role === 'superuser'
                  ? '<input name="salon_id" placeholder="Salon UUID (required for superuser)" />'
                  : ''
              }
              <button type="submit">Add Customer</button>
            </form>
            <p class="nd-muted">Admins are auto-scoped to their salon.</p>
            <p id="nd-customer-error" class="nd-error"></p>
          `
          : '<p class="nd-muted">Read-only access for this role.</p>'
      }
      <div class="nd-table-wrap">
        <table class="nd-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Salon</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows.length
                ? rows
                    .map((row) => {
                      const isEditing = state.editing.customerId === row.id;
                      const baseRow = `
                        <tr>
                          <td>${esc(row.name)}</td>
                          <td>${esc(row.email)}</td>
                          <td><code>${esc(row.salon_id || '-')}</code></td>
                          <td>
                            ${
                              canCreate
                                ? `<div class="nd-row-actions"><button class="nd-secondary" data-action="start-edit-customer" data-id="${esc(row.id)}">Edit</button><button class="nd-danger" data-action="delete-customer" data-id="${esc(row.id)}">Delete</button></div>`
                                : '-'
                            }
                          </td>
                        </tr>
                      `;

                      if (!isEditing) return baseRow;

                      return `${baseRow}
                        <tr class="nd-edit-row">
                          <td colspan="4">
                            <form class="nd-inline-form" id="nd-customer-edit-form-${esc(row.id)}" data-id="${esc(row.id)}">
                              <input name="name" required value="${esc(row.name)}" />
                              <input name="email" type="email" required value="${esc(row.email)}" />
                              ${role === 'superuser' ? `<input name="salon_id" value="${esc(row.salon_id || '')}" placeholder="Salon UUID" />` : ''}
                              <button type="submit">Save</button>
                              <button type="button" class="nd-secondary" data-action="cancel-edit-customer">Cancel</button>
                            </form>
                          </td>
                        </tr>
                      `;
                    })
                    .join('')
                : '<tr><td colspan="4" class="nd-empty">No customers yet.</td></tr>'
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

export function bindCustomersEvents(ctx) {
  const { app, state, client, refreshData, render } = ctx;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  const customerForm = document.getElementById('nd-customer-form');
  if (customerForm) {
    customerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorNode = document.getElementById('nd-customer-error');
      errorNode.textContent = '';

      const formData = new FormData(customerForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
      };

      const salonId = String(formData.get('salon_id') || '').trim();
      if (salonId) payload.salon_id = salonId;

      try {
        await client.createCustomer(payload);
        customerForm.reset();
        await refreshData();
        render();
      } catch (error) {
        errorNode.textContent = error.message || 'Failed to create customer';
      }
    });
  }

  app.querySelectorAll('[data-action="delete-customer"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      if (!window.confirm('Delete this customer?')) return;

      try {
        await client.deleteCustomer(id);
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to delete customer');
      }
    });
  });

  app.querySelectorAll('[data-action="start-edit-customer"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.customerId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="cancel-edit-customer"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.editing.customerId = null;
      render();
    });
  });

  app.querySelectorAll('form[id^="nd-customer-edit-form-"]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = form.dataset.id;
      if (!id) return;

      const formData = new FormData(form);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
      };

      const salonId = String(formData.get('salon_id') || '').trim();
      if (salonId) payload.salon_id = salonId;

      try {
        await client.updateCustomer(id, payload);
        state.editing.customerId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to update customer');
      }
    });
  });
}
