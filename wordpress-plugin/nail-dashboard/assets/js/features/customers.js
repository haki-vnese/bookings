function filterCustomers(rows, filters) {
  const q = String(filters?.q || '').trim().toLowerCase();
  const salon = String(filters?.salon || '').trim();

  return rows.filter((row) => {
    if (salon && row.salon_id !== salon) return false;
    if (!q) return true;
    const haystack = [row.name, row.email, row.phone, row.salon_name, row.salon_id]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');
    return haystack.includes(q);
  });
}

function renderCustomerModal(state, helpers, role) {
  const { esc } = helpers;
  const editingId = state.modal.type === 'edit-customer' ? state.modal.rowId : null;
  const editingRow = state.data.customers.find((row) => row.id === editingId) || null;
  const companies = state.data.companies || [];
  const salons = state.data.salons || [];
  const selectedCompanyId = editingRow?.company_id || '';
  const selectedSalonId = editingRow?.salon_id || '';
  const scopedSalons = role === 'superuser'
    ? (selectedCompanyId ? salons.filter((row) => row.company_id === selectedCompanyId) : salons)
    : salons;

  if (!editingRow) return '';

  return `
    <div class="nd-modal-backdrop" data-action="close-customer-modal">
      <div class="nd-modal" role="dialog" aria-modal="true" aria-label="Customer form" onclick="event.stopPropagation()">
        <div class="nd-panel-head">
          <h3>Edit Customer</h3>
          <button class="nd-ghost" data-action="close-customer-modal">Close</button>
        </div>
        <form id="nd-customer-modal-form" class="nd-modal-form" data-id="${esc(editingRow?.id || '')}">
          <input name="name" required placeholder="Customer name" value="${esc(editingRow?.name || '')}" />
          <input name="email" type="email" required placeholder="Email" value="${esc(editingRow?.email || '')}" />
          <input name="phone" placeholder="Phone" value="${esc(editingRow?.phone || '')}" />
          ${role === 'superuser' ? `
            <select name="company_id">
              <option value="">No company</option>
              ${companies
                .map((row) => `<option value="${esc(row.id)}" ${selectedCompanyId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
                .join('')}
            </select>
          ` : ''}
          <select name="salon_id" ${role === 'superuser' ? 'required' : ''}>
            <option value="">${role === 'superuser' ? 'Select salon' : 'Use my salon scope'}</option>
            ${scopedSalons
              .map((row) => `<option value="${esc(row.id)}" ${selectedSalonId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
              .join('')}
          </select>
          <button type="submit">Save</button>
        </form>
      </div>
    </div>
  `;
}

export function renderCustomersPanel(state, helpers) {
  const { canManage, esc } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const rows = filterCustomers(state.data.customers || [], state.filters.customer || {});
  const canEdit = canManage(role);
  const salons = state.data.salons || [];
  const salonsById = new Map(salons.map((row) => [row.id, row.name]));

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Customers</h3>
        <div class="nd-row-actions">
          <button class="nd-ghost" data-action="refresh-data">Refresh</button>
        </div>
      </div>
      <form id="nd-customer-filter" class="nd-filters">
        <input name="q" placeholder="Search by name, email, phone, salon" value="${esc(state.filters.customer.q || '')}" />
        <select name="salon">
          <option value="">All salons</option>
          ${salons
            .map((row) => `<option value="${esc(row.id)}" ${state.filters.customer.salon === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
            .join('')}
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
              <th>Phone</th>
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
                          <td>${esc(row.phone || '-')}</td>
                          <td>${esc(row.salon_name || salonsById.get(row.salon_id) || row.salon_id || '-')}</td>
                          <td>
                            ${
                              canEdit
                                ? `<div class="nd-row-actions"><button class="nd-secondary" data-action="open-edit-customer" data-id="${esc(row.id)}">Edit</button><button class="nd-danger" data-action="delete-customer" data-id="${esc(row.id)}">Delete</button></div>`
                                : '-'
                            }
                          </td>
                        </tr>
                      `
                    )
                    .join('')
                : '<tr><td colspan="5" class="nd-empty">No customers yet.</td></tr>'
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
        phone: String(formData.get('phone') || '').trim() || null,
        salon_id: String(formData.get('salon_id') || '').trim(),
      };

      const companyId = String(formData.get('company_id') || '').trim();
      if (companyId) payload.company_id = companyId;

      try {
        if (state.modal.type !== 'edit-customer' || !id) return;
        await client.updateCustomer(id, payload);
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
