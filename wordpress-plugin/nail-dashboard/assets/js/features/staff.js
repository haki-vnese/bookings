function filterStaff(rows, filters) {
  const q = String(filters?.q || '').trim().toLowerCase();
  const salon = String(filters?.salon || '').trim();

  return rows.filter((row) => {
    if (salon && row.salon_id !== salon) return false;
    if (!q) return true;

    const haystack = [row.name, row.email, row.phone, row.salon_name, row.salon_id]
      .map((v) => String(v || '').toLowerCase())
      .join(' ');
    return haystack.includes(q);
  });
}

function getSalonLabel(row) {
  return row.salon_name || row.salon_id || '-';
}

function renderStaffModal(state, helpers, role) {
  const { esc } = helpers;
  const editingId = state.modal.type === 'edit-staff' ? state.modal.rowId : null;
  const editingRow = state.data.staff.find((row) => row.staff_id === editingId) || null;
  const isCreate = state.modal.type === 'create-staff';
  const companies = state.data.companies || [];
  const salons = state.data.salons || [];
  const selectedCompanyId = editingRow?.company_id || '';
  const selectedSalonId = editingRow?.salon_id || '';
  const scopedSalons = role === 'superuser'
    ? (selectedCompanyId ? salons.filter((row) => row.company_id === selectedCompanyId) : salons)
    : salons;

  if (!isCreate && !editingRow) return '';

  return `
    <div class="nd-modal-backdrop" data-action="close-staff-modal">
      <div class="nd-modal" role="dialog" aria-modal="true" aria-label="Staff form" onclick="event.stopPropagation()">
        <div class="nd-panel-head">
          <h3>${isCreate ? 'Add Staff' : 'Edit Staff'}</h3>
          <button class="nd-ghost" data-action="close-staff-modal">Close</button>
        </div>
        <form id="nd-staff-modal-form" class="nd-modal-form" data-id="${esc(editingRow?.staff_id || '')}">
          <input name="name" required placeholder="Full name" value="${esc(editingRow?.name || '')}" />
          <input name="email" type="email" placeholder="Email" value="${esc(editingRow?.email || '')}" />
          <input name="phone" placeholder="Phone" value="${esc(editingRow?.phone || '')}" />
          ${role === 'superuser' ? `
            <select name="company_id" required>
              <option value="">Select company</option>
              ${companies
                .map((row) => `<option value="${esc(row.id)}" ${selectedCompanyId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
                .join('')}
            </select>
          ` : ''}
          <select name="salon_id" required>
            <option value="">Select salon</option>
            ${scopedSalons
              .map((row) => `<option value="${esc(row.id)}" ${selectedSalonId === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
              .join('')}
          </select>
          <button type="submit">${isCreate ? 'Create' : 'Save'}</button>
        </form>
      </div>
    </div>
  `;
}

export function renderStaffPanel(state, helpers) {
  const { canManage, esc } = helpers;
  const role = String(state.user?.role || '').toLowerCase();
  const canCreate = canManage(role);
  const filters = state.filters.staff || {};
  const rows = filterStaff(state.data.staff || [], filters);

  if (role === 'staff') {
    const me = (state.data.staff || [])[0] || null;
    return `
      <section class="nd-panel">
        <div class="nd-panel-head">
          <h3>My Staff Profile</h3>
          <button class="nd-ghost" data-action="refresh-data">Refresh</button>
        </div>
        ${
          me
            ? `<div class="nd-staff-summary"><p><strong>Name:</strong> ${esc(me.name)}</p><p><strong>Email:</strong> ${esc(me.email || '-')}</p><p><strong>Phone:</strong> ${esc(me.phone || '-')}</p><p><strong>Salon:</strong> ${esc(getSalonLabel(me))}</p></div>`
            : '<p class="nd-muted">No linked staff profile was found.</p>'
        }
      </section>
    `;
  }

  const salons = state.data.salons || [];
  const salonsById = new Map(salons.map((row) => [row.id, row.name]));

  return `
    <section class="nd-panel">
      <div class="nd-panel-head">
        <h3>Staff Directory</h3>
        <div class="nd-row-actions">
          <button class="nd-ghost" data-action="refresh-data">Refresh</button>
          ${canCreate ? '<button data-action="open-create-staff">Add Staff</button>' : ''}
        </div>
      </div>
      <form id="nd-staff-filter" class="nd-filters">
        <input name="q" placeholder="Search by name, email, phone" value="${esc(filters.q || '')}" />
        <select name="salon">
          <option value="">All salons</option>
          ${salons
            .map((row) => `<option value="${esc(row.id)}" ${filters.salon === row.id ? 'selected' : ''}>${esc(row.name)}</option>`)
            .join('')}
        </select>
        <button type="submit" class="nd-secondary">Apply Filter</button>
        <button type="button" class="nd-ghost" data-action="clear-staff-filter">Clear</button>
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
                          <td>${esc(row.email || '-')}</td>
                          <td>${esc(row.phone || '-')}</td>
                          <td>${esc(row.salon_name || salonsById.get(row.salon_id) || getSalonLabel(row))}</td>
                          <td>
                            <div class="nd-row-actions">
                              <button class="nd-secondary" data-action="open-edit-staff" data-id="${esc(row.staff_id)}">Edit</button>
                              <button class="nd-danger" data-action="delete-staff" data-id="${esc(row.staff_id)}">Delete</button>
                            </div>
                          </td>
                        </tr>
                      `
                    )
                    .join('')
                : '<tr><td colspan="5" class="nd-empty">No staff in scope.</td></tr>'
            }
          </tbody>
        </table>
      </div>
      ${renderStaffModal(state, helpers, role)}
    </section>
  `;
}

export function bindStaffEvents(ctx) {
  const { app, state, client, refreshData, render } = ctx;

  app.querySelectorAll('[data-action="refresh-data"]').forEach((button) => {
    button.addEventListener('click', async () => {
      await refreshData();
      render();
    });
  });

  const filterForm = document.getElementById('nd-staff-filter');
  if (filterForm) {
    filterForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(filterForm);
      state.filters.staff.q = String(formData.get('q') || '').trim();
      state.filters.staff.salon = String(formData.get('salon') || '').trim();
      render();
    });
  }

  app.querySelectorAll('[data-action="clear-staff-filter"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.staff = { q: '', salon: '' };
      render();
    });
  });

  app.querySelectorAll('[data-action="open-create-staff"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'create-staff';
      state.modal.rowId = null;
      render();
    });
  });

  app.querySelectorAll('[data-action="open-edit-staff"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = 'edit-staff';
      state.modal.rowId = button.dataset.id || null;
      render();
    });
  });

  app.querySelectorAll('[data-action="close-staff-modal"]').forEach((button) => {
    button.addEventListener('click', () => {
      state.modal.type = null;
      state.modal.rowId = null;
      render();
    });
  });

  app.querySelectorAll('[data-action="delete-staff"]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.id;
      if (!id) return;
      if (!window.confirm('Delete this staff record?')) return;

      try {
        await client.deleteStaff(id);
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to delete staff');
      }
    });
  });

  const modalForm = document.getElementById('nd-staff-modal-form');
  if (modalForm) {
    modalForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = modalForm.dataset.id || null;
      const formData = new FormData(modalForm);
      const payload = {
        name: String(formData.get('name') || '').trim(),
        email: String(formData.get('email') || '').trim() || null,
        phone: String(formData.get('phone') || '').trim() || null,
        salon_id: String(formData.get('salon_id') || '').trim(),
      };

      const companyId = String(formData.get('company_id') || '').trim();
      if (companyId) payload.company_id = companyId;

      try {
        if (state.modal.type === 'edit-staff' && id) {
          await client.updateStaff(id, payload);
        } else {
          await client.createStaff(payload);
        }
        state.modal.type = null;
        state.modal.rowId = null;
        await refreshData();
        render();
      } catch (error) {
        window.alert(error.message || 'Failed to save staff');
      }
    });
  }
}
