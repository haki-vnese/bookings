function filterCustomers(rows, filters) {
  const q = String(filters?.q || '').trim().toLowerCase();
  const salon = String(filters?.salon || '').trim();

  return rows.filter((row) => {
    if (salon && row.salon_id !== salon) return false;
    if (!q) return true;
    const haystack = [row.name, row.email, row.salon_name, row.salon_id]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return haystack.includes(q);
  });
}

function renderCustomerModal(state, helpers, role) {
  const { esc } = helpers;
  const editingId = state.modal.type === 'edit-customer' ? state.modal.rowId : null;
  const editingRow = state.data.customers.find((row) => row.id === editingId) || null;
  const isCreate = state.modal.type === 'create-customer';

  if (!isCreate && !editingRow) return '';

  return `
    <div class="nd-modal-backdrop" data-action="close-customer-modal">
      <div class="nd-modal" role="dialog" aria-modal="true" aria-label="Customer form" onclick="event.stopPropagation()">
        <div class="nd-panel-head">
          <h3>${isCreate ? 'Add Customer' : 'Edit Customer'}</h3>
          <button class="nd-ghost" data-action="close-customer-modal">Close</button>
        </div>
        <form id="nd-customer-modal-form" class="nd-modal-form" data-id="${esc(editingRow?.id || '')}">
          <input name="name" required placeholder="Customer name" value="${esc(editingRow?.name || '')}" />
          <input name="email" type="email" required placeholder="Email" value="${esc(editingRow?.email || '')}" />
          <input name="salon_id" ${role === 'superuser' ? 'required' : ''} placeholder="Salon UUID" value="${esc(editingRow?.salon_id || '')}" />
          ${role === 'superuser' ? `<input name="company_id" placeholder="Company UUID" value="${esc(editingRow?.company_id || '')}" />` : ''}
          <button type="submit">${isCreate ? 'Create' : 'Save'}</button>
        </form>
      </div>
    </div>
  `;
}

export function renderCustomersPanel(state, helpers) {
  const { canManage, esc } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const rows = filterCustomers(state.data.customers || [], state.filters.customer || {});
  const canCreate = canManage(role);
  const salonOptions = [...new Set((state.data.customers || []).map((row) => row.salon_id).filter(Boolean))];

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Customers</h3>
        <div class="nd-row-actions">
          <button class="nd-ghost" data-action="refresh-data">Refresh</button>
          ${canCreate ? '<button data-action="open-create-customer">Add Customer</button>' : ''}
        </div>
      </div>
      <form id="nd-customer-filter" class="nd-filters">
        <input name="q" placeholder="Search by name, email, salon" value="${esc(state.filters.customer.q || '')}" />
        <select name="salon">
          <option value="">All salons</option>
          ${salonOptions.map((id) => `<option value="${esc(id)}" ${state.filters.customer.salon === id ? 'selected' : ''}>${esc(id)}</option>`).join('')}
        </select>
        <button type="submit" class="nd-secondary">Apply Filter</button>
        <button type="button" class="nd-ghost" data-action="clear-customer-filter">Clear</button>
      </form>
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
                    .map(
                      (row) => `
                        <tr>
                          <td>${esc(row.name)}</td>
                          <td>${esc(row.email)}</td>
                          <td>${esc(row.salon_name || row.salon_id || '-')}</td>
                          <td>
                            ${
                              canCreate
                                ? `<div class="nd-row-actions"><button class="nd-secondary" data-action="open-edit-customer" data-id="${esc(row.id)}">Edit</button><button class="nd-danger" data-action="delete-customer" data-id="${esc(row.id)}">Delete</button></div>`
                                : '-'
                            }
                          </td>
                        </tr>
                      `
                    )
                    .join('')
                : '<tr><td colspan="4" class="nd-empty">No customers yet.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      ${renderCustomerModal(state, helpers, role)}
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

  const filterForm = document.getElementById('nd-customer-filter');
  if (filterForm) {
    filterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(filterForm);
      state.filters.customer.q = String(formData.get('q') || '').trim();
      state.filters.customer.salon = String(formData.get('salon') || '').trim();
      render();
    });
  }

  app.querySelectorAll('[data-action="clear-customer-filter"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.customer = { q: '', salon: '' };
      render();
    });
  });

  app.querySelectorAll('[data-action="open-create-customer"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'create-customer';
      state.modal.rowId = null;
      render();
    });
  });

  app.querySelectorAll('[data-action="open-edit-customer"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'edit-customer';
      state.modal.rowId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="close-customer-modal"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = null;
      state.modal.rowId = null;
      render();
    });
  });

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

  const modalForm = document.getElementById('nd-customer-modal-form');
  if (modalForm) {
    modalForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = modalForm.dataset.id || null;

      const formData = new FormData(modalForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim(),
        salon_id: String(formData.get('salon_id') || '').trim(),
      };

      const companyId = String(formData.get('company_id') || '').trim();
      if (companyId) payload.company_id = companyId;

      try {
        if (state.modal.type === 'edit-customer' && id) {
          await client.updateCustomer(id, payload);
        } else {
          await client.createCustomer(payload);
        }
        state.modal.type = null;
        state.modal.rowId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to save customer');
      }
    });
  }
}
